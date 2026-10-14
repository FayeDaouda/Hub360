import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TachesProjetService } from '../projets/gabarit/taches-projet.service';
import { ROLE_CFO } from '../projets/gabarit/validation';
import type { AjouterTsDto } from '../projets/gabarit/dto';
import { DevisService } from './devis.service';
import type { LigneDevisDto } from './dto';

const PRODUIT_TS = { mineure: 'TS-MIN', majeure: 'TS-MAJ' } as const;
const OBJET_AVENANT = 'Avenant · travaux supplémentaires';

// Élément ajouté en TS (Projets, Architecte DPLG) → ligne du devis d'avenant
// du projet (CGV art. 8). Le chiffrage suit le catalogue (TS-MIN forfait,
// TS-MAJ tarif CO × surface × planches) ; l'avenant en préparation (brouillon)
// reçoit la ligne, sinon un nouveau est créé. Le CFO et le propriétaire du
// dossier le relisent et l'envoient au client. Rien ne bloque la production.
@Injectable()
export class AvenantsTsService {
  private readonly log = new Logger('AvenantsTs');

  constructor(
    private prisma: PrismaService,
    private devis: DevisService,
    private taches: TachesProjetService,
    private notifications: NotificationsService,
  ) {}

  async ajouterTs(societeId: string, acteur: { userId: string; role: string }, projetId: string, dto: AjouterTsDto) {
    const projet = await this.prisma.projet.findFirst({
      where: { id: projetId, societeId, ouvertLe: { not: null } },
      select: { code: true, clientId: true, dossierCrm: { select: { proprietaireId: true } } },
    });
    if (!projet) throw new NotFoundException('Projet introuvable ou pas encore ouvert');
    const code = PRODUIT_TS[dto.reprise];
    const produit = await this.prisma.produitService.findFirst({ where: { societeId, code, supprime: false }, select: { id: true } });
    if (!produit) throw new UnprocessableEntityException(`Produit ${code} absent du catalogue : l’avenant ne peut pas être chiffré.`);

    const ligne: LigneDevisDto = {
      produitServiceId: produit.id,
      designation: 'TS',
      quantite: 1,
      prixUnitaire: 0,
      ...(dto.reprise === 'majeure' ? { surfaceM2: dto.surfaceM2, planches: dto.planches } : {}),
    };
    // Chiffrage vérifié avant de créer la tâche : un refus ne laisse rien derrière.
    await this.devis.verifierLignesProjet(societeId, projetId, [ligne]);
    const tache = await this.taches.ajouterTs(societeId, acteur, projetId, dto.carteId, dto.element);
    ligne.designation = tache.libelle;

    const enCours = await this.prisma.devis.findFirst({
      where: { societeId, projetId, dossierCrmId: null, statut: 'brouillon', lignes: { some: { produitService: { famille: 'TS' } } } },
      orderBy: { creeLe: 'desc' },
      select: { id: true, lignes: { orderBy: { ordre: 'asc' } } },
    });
    const avenant = enCours
      ? await this.devis.patch(societeId, enCours.id, {
          lignes: [
            ...enCours.lignes.map((l) => ({
              produitServiceId: l.produitServiceId ?? undefined,
              designation: l.designation,
              quantite: l.quantite.toNumber(),
              prixUnitaire: l.prixUnitaire.toNumber(),
              tauxTva: l.tauxTva.toNumber(),
              surfaceM2: l.surfaceM2 ?? undefined,
              planches: l.planches ?? undefined,
            })),
            ligne,
          ],
        })
      : await this.devis.creer(societeId, { clientId: projet.clientId, projetId, objet: OBJET_AVENANT, lignes: [ligne] });
    await this.prisma.tacheProjet.update({ where: { id: tache.id }, data: { devisTsId: avenant.id } });

    await this.notifications.envoyer({
      societeId,
      type: 'avenant_ts',
      titre: `Avenant à envoyer au client · ${projet.code} · ${tache.libelle}`,
      destinataireIds: [projet.dossierCrm.proprietaireId, ...(await this.notifications.titulairesRole(societeId, ROLE_CFO))],
      parId: acteur.userId,
      projetId,
    });
    return { ...tache, devisId: avenant.id };
  }
}
