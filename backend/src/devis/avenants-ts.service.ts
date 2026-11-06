import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReglagesService } from '../reglages/reglages.service';
import { decisionContext } from '../projects/decision-context';
import { TsElementsService } from '../projects/ts-elements.service';
import { tsRight } from '../projects/review-rules';
import type { AddTsElementDto } from '../projects/open-projects.dto';
import { DevisService } from './devis.service';
import type { LigneDevisDto } from './dto';
import { ETAPE, formatAmount, hasRight, ROLE_CFO, ROLE_COMPANY_ADMIN, ROLE_CTO, todayIso } from '@hub/domain';

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
    private tsElements: TsElementsService,
    private notifications: NotificationsService,
    private reglages: ReglagesService,
  ) {}

  // Seuil des Réglages (revue Dir. GC, 21/10/2026) : jusqu'au seuil, le Dir. GC
  // ajoute le TS ; au-delà, il le demande et le CTO le valide (ou l'ajoute).
  async ajouterTs(
    societeId: string,
    acteur: { userId: string; role: string; permissions?: Record<string, string> },
    projetId: string,
    dto: AddTsElementDto,
  ) {
    const { ligne } = await this.chiffrer(societeId, projetId, dto);
    const montantHt = Math.round(ligne.quantite * ligne.prixUnitaire);
    const seuil = await this.reglages.regle<number>(societeId, 'seuil_ts_cto_ht');
    const ctx = await decisionContext(this.prisma, societeId, todayIso());
    const droit = tsRight(
      { role: acteur.role, employeeId: null, ctoStandsIn: ctx.ctoStandsIn, permissions: acteur.permissions },
      montantHt,
      seuil,
    );
    if (!droit) throw new ForbiddenException('Ajouter en TS est réservé à l’Architecte DPLG (ou au CTO).');
    if (droit === 'ajouter') return this.creer(societeId, acteur, projetId, dto);

    const projet = await this.prisma.projet.findFirstOrThrow({
      where: { id: projetId, societeId },
      select: { code: true },
    });
    const demande = await this.prisma.demandeTs.create({
      data: {
        societeId,
        projetId,
        carteId: dto.carteId,
        element: dto.element.trim(),
        reprise: dto.reprise,
        surfaceM2: dto.reprise === 'majeure' ? dto.surfaceM2 : null,
        planches: dto.reprise === 'majeure' ? dto.planches : null,
        montantHt,
        demandeParId: acteur.userId,
      },
    });
    await this.notifications.envoyer({
      societeId,
      type: 'ts_a_valider',
      titre: `TS à valider · ${projet.code} · ${dto.element.trim()} · ${formatAmount(montantHt)} HT (au-delà du seuil)`,
      destinataireIds: ctx.ctoAccounts.filter((id) => id !== acteur.userId),
      parId: acteur.userId,
      projetId,
    });
    return { enAttente: true as const, demandeId: demande.id, montantHt, seuil };
  }

  // Décision du CTO sur un TS au-delà du seuil : accepté, il est ajouté (tâche
  // + avenant) ; refusé, avec un motif. Le demandeur est prévenu.
  async deciderDemande(
    societeId: string,
    acteur: { userId: string; role: string; permissions?: Record<string, string> },
    projetId: string,
    demandeId: string,
    accepter: boolean,
    motif?: string,
  ) {
    if (!hasRight(acteur.permissions, ETAPE.projetsTs, 'validation'))
      throw new ForbiddenException('Un TS au-delà du seuil demande la Validation de « Travaux supplémentaires ».');
    const d = await this.prisma.demandeTs.findFirst({
      where: { id: demandeId, projetId, societeId },
      include: { projet: { select: { code: true } } },
    });
    if (!d) throw new NotFoundException('Demande introuvable');
    if (!accepter && !motif?.trim()) throw new BadRequestException('Le motif du refus est obligatoire.');
    const { count } = await this.prisma.demandeTs.updateMany({
      where: { id: d.id, statut: 'a_valider' },
      data: {
        statut: accepter ? 'acceptee' : 'refusee',
        decideParId: acteur.userId,
        decideLe: new Date(),
        motifRefus: accepter ? '' : motif!.trim(),
      },
    });
    if (!count) throw new ConflictException('Cette demande a déjà été tranchée.');
    let tacheId: string | null = null;
    if (accepter) {
      const dto: AddTsElementDto = {
        carteId: d.carteId,
        element: d.element,
        reprise: d.reprise as AddTsElementDto['reprise'],
        ...(d.reprise === 'majeure' ? { surfaceM2: d.surfaceM2 ?? undefined, planches: d.planches ?? undefined } : {}),
      };
      try {
        tacheId = (await this.creer(societeId, acteur, projetId, dto)).id;
      } catch (e) {
        // L'ajout a échoué (carte désactivée entre-temps…) : la demande reste à trancher.
        await this.prisma.demandeTs.update({
          where: { id: d.id },
          data: { statut: 'a_valider', decideParId: null, decideLe: null },
        });
        throw e;
      }
      await this.prisma.demandeTs.update({ where: { id: d.id }, data: { tacheId } });
    }
    if (d.demandeParId) {
      await this.notifications.envoyer({
        societeId,
        type: 'ts_decide',
        titre: accepter
          ? `TS validé par le CTO et ajouté · ${d.projet.code} · ${d.element}`
          : `TS refusé par le CTO · ${d.projet.code} · ${d.element} · ${motif!.trim()}`,
        destinataireIds: [d.demandeParId],
        parId: acteur.userId,
        projetId,
      });
    }
    return { statut: accepter ? 'acceptee' : 'refusee', tacheId };
  }

  // Ligne d'avenant chiffrée au catalogue (TS-MIN forfait, TS-MAJ tarif CO ×
  // surface × planches) : vérifiée avant toute écriture.
  private async chiffrer(societeId: string, projetId: string, dto: AddTsElementDto) {
    const code = PRODUIT_TS[dto.reprise];
    const produit = await this.prisma.produitService.findFirst({
      where: { societeId, code, supprime: false },
      select: { id: true },
    });
    if (!produit)
      throw new UnprocessableEntityException(
        `Produit ${code} absent du catalogue : l’avenant ne peut pas être chiffré.`,
      );
    const ligne: LigneDevisDto = {
      produitServiceId: produit.id,
      designation: 'TS',
      quantite: 1,
      prixUnitaire: 0,
      ...(dto.reprise === 'majeure' ? { surfaceM2: dto.surfaceM2, planches: dto.planches } : {}),
    };
    const [chiffree] = await this.devis.verifierLignesProjet(societeId, projetId, [ligne]);
    return { ligneDto: ligne, ligne: { quantite: chiffree?.quantite ?? 1, prixUnitaire: chiffree?.prixUnitaire ?? 0 } };
  }

  private async creer(
    societeId: string,
    acteur: { userId: string; role: string; permissions?: Record<string, string> },
    projetId: string,
    dto: AddTsElementDto,
  ) {
    const projet = await this.prisma.projet.findFirst({
      where: { id: projetId, societeId, ouvertLe: { not: null } },
      select: { code: true, clientId: true, dossierCrm: { select: { proprietaireId: true } } },
    });
    if (!projet) throw new NotFoundException('Projet introuvable ou pas encore ouvert');
    // Chiffrage vérifié avant de créer la tâche : un refus ne laisse rien derrière.
    const { ligneDto: ligne } = await this.chiffrer(societeId, projetId, dto);
    const tache = await this.tsElements.add(societeId, acteur, projetId, dto.carteId, dto.element);
    ligne.designation = tache.libelle;

    const enCours = await this.prisma.devis.findFirst({
      where: {
        societeId,
        projetId,
        dossierCrmId: null,
        statut: 'brouillon',
        lignes: { some: { produitService: { famille: 'TS' } } },
      },
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
      : await this.devis.creer(societeId, {
          clientId: projet.clientId,
          projetId,
          objet: OBJET_AVENANT,
          lignes: [ligne],
        });
    await this.prisma.tacheProjet.update({ where: { id: tache.id }, data: { devisTsId: avenant.id } });

    await this.notifications.envoyer({
      societeId,
      type: 'avenant_ts',
      titre: `Avenant à envoyer au client · ${projet.code} · ${tache.libelle}`,
      destinataireIds: [
        projet.dossierCrm.proprietaireId,
        ...(await this.notifications.titulairesRole(societeId, ROLE_CFO)),
      ],
      parId: acteur.userId,
      projetId,
    });
    return { ...tache, devisId: avenant.id };
  }
}
