import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Categorie, EtapePreBilan, Phase, Prisma, StatutProjet } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ETAPES_PRE_BILAN,
  GABARIT_CHECKLIST_AVP,
  LIBELLES_PHASE,
  phaseApresAvantProjet,
} from './domaine/config';
import { NotificationsService } from '../notifications/notifications.service';
import { checklistComplete, phasesAdjacentes, preBilanComplet } from './domaine/gardes';
import { versAvantProjet, versProjetExecution } from '../commun/format-contrat';
import { ouProjetsDuCollaborateur } from './projet-acces';
import {
  AjouterLigneChecklistAvpDto,
  PatchAvantProjetDto,
  PatchLigneChecklistAvpDto,
  PatchVersionDto,
} from './dto';

// Contexte d'accès résolu par le contrôleur depuis req.user. `null` = admin
// (voit tout) ; sinon la liste est restreinte au périmètre du collaborateur.
type AccesListe = { role: string; userId: string; societeId: string };

@Injectable()
export class ProjetsService {
  private readonly log = new Logger('Projets');
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async findAll(societeId: string, acces?: AccesListe) {
    const where: Prisma.ProjetWhereInput = { societeId };

    if (acces && acces.role === 'collaborateur') {
      const collab = await this.prisma.collaborateur.findFirst({
        where: { utilisateurId: acces.userId, societeId },
        select: { id: true, celluleId: true },
      });
      if (!collab) throw new NotFoundException('Aucune fiche collaborateur pour ce compte');
      where.OR = ouProjetsDuCollaborateur(collab);
    }

    const projets = await this.prisma.projet.findMany({
      where,
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
    return projets.map(versProjetExecution);
  }

  async findOne(societeId: string, id: string) {
    const projet = await this.prisma.projet.findFirst({
      where: { id, societeId },
      include: { client: true },
    });
    if (!projet) throw new NotFoundException('Projet introuvable');
    return versProjetExecution(projet);
  }

  async assigner(
    societeId: string,
    id: string,
    celluleId: string | null,
    parId?: string,
  ) {
    const projet = await this.charger(societeId, id);
    if (celluleId) {
      const cellule = await this.prisma.cellule.findFirst({
        where: { id: celluleId, societeId },
      });
      if (!cellule) throw new NotFoundException('Cellule introuvable');
    }
    let statut: StatutProjet = projet.statut;
    if (projet.statut === 'a_assigner' && celluleId) statut = 'assigne';
    else if (!celluleId && projet.statut === 'assigne') statut = 'a_assigner';

    const maj = await this.prisma.projet.update({
      where: { id },
      data: { celluleId, statut },
      include: { client: true },
    });

    // Notifie la nouvelle cellule (pas au simple retrait d'assignation).
    if (celluleId && celluleId !== projet.celluleId) {
      await this.notifier(() =>
        this.notifications.pousser({
          societeId,
          projet: { id: maj.id, code: maj.code, celluleId: maj.celluleId },
          type: 'projet_assigne',
          titre: `${maj.programme} · assigné à ta cellule`,
          parId,
        }),
      );
    }
    return versProjetExecution(maj);
  }

  // PATCH /projets/:id/carte — pose ou retire le pin géo (posé à la main).
  async poserPin(
    societeId: string,
    id: string,
    coords: { latitude: number | null; longitude: number | null },
  ) {
    await this.charger(societeId, id);
    const maj = await this.prisma.projet.update({
      where: { id },
      data: { latitude: coords.latitude, longitude: coords.longitude },
      include: { client: true },
    });
    return versProjetExecution(maj);
  }

  // -- Avant-projet --------------------------------------------------------

  async getAvantProjet(societeId: string, id: string) {
    await this.charger(societeId, id);
    return versAvantProjet(await this.coquilleAvantProjet(id));
  }

  async patchAvantProjet(societeId: string, id: string, dto: PatchAvantProjetDto) {
    await this.charger(societeId, id);
    await this.coquilleAvantProjet(id);
    const actuel = await this.prisma.avantProjet.findUnique({ where: { projetId: id } });
    if (actuel?.valideLe) {
      throw new ConflictException('Avant-projet validé — lecture seule');
    }
    // La checklist macro arrive imbriquée : on l'aplati vers les colonnes.
    const { checklist, ...fiche } = dto;
    await this.prisma.avantProjet.update({
      where: { projetId: id },
      data: { ...fiche, ...(checklist ?? {}) },
    });
    return versAvantProjet(await this.chargerAvantProjetComplet(id));
  }

  // PATCH …/avant-projet/checklist/:ligneId — un champ à la fois (fait, note).
  // Aucun verrou de phase ; simplement figé si l'avant-projet est validé
  // (cohérent avec patchAvantProjet).
  async patchLigneChecklistAvp(
    societeId: string,
    id: string,
    ligneId: string,
    dto: PatchLigneChecklistAvpDto,
  ) {
    await this.charger(societeId, id);
    await this.coquilleAvantProjet(id);
    const ap = await this.prisma.avantProjet.findUnique({
      where: { projetId: id },
      select: { valideLe: true },
    });
    if (ap?.valideLe) {
      throw new ConflictException('Avant-projet validé — lecture seule');
    }

    const data: Prisma.LigneChecklistAvpUpdateInput = {};
    if (dto.fait !== undefined) data.fait = dto.fait;
    if (dto.note !== undefined) data.note = dto.note;

    const { count } = await this.prisma.ligneChecklistAvp.updateMany({
      where: { id: ligneId, avantProjetId: id, supprimee: false },
      data,
    });
    if (count === 0) throw new NotFoundException('Item de checklist introuvable');
    return versAvantProjet(await this.chargerAvantProjetComplet(id));
  }

  // Ajout d'un item de checklist propre à ce projet — admin uniquement (route
  // non marquée @EcritureCollaborateur, fermée par défaut pour ce rôle). Va en
  // fin du groupe ciblé.
  async ajouterLigneChecklistAvp(
    societeId: string,
    id: string,
    dto: AjouterLigneChecklistAvpDto,
  ) {
    await this.charger(societeId, id);
    await this.coquilleAvantProjet(id);
    const ap = await this.prisma.avantProjet.findUnique({
      where: { projetId: id },
      select: { valideLe: true },
    });
    if (ap?.valideLe) {
      throw new ConflictException('Avant-projet validé — lecture seule');
    }

    const { _max } = await this.prisma.ligneChecklistAvp.aggregate({
      where: { avantProjetId: id, groupe: dto.groupe },
      _max: { ordre: true },
    });
    await this.prisma.ligneChecklistAvp.create({
      data: {
        avantProjetId: id,
        groupe: dto.groupe,
        libelle: dto.libelle,
        ordre: (_max.ordre ?? -1) + 1,
      },
    });
    return versAvantProjet(await this.chargerAvantProjetComplet(id));
  }

  // Suppression douce (comme ImageProjet/FichierProjet) — admin uniquement.
  async supprimerLigneChecklistAvp(
    societeId: string,
    id: string,
    ligneId: string,
    utilisateurId: string,
  ) {
    await this.charger(societeId, id);
    const ap = await this.prisma.avantProjet.findUnique({
      where: { projetId: id },
      select: { valideLe: true },
    });
    if (ap?.valideLe) {
      throw new ConflictException('Avant-projet validé — lecture seule');
    }

    const { count } = await this.prisma.ligneChecklistAvp.updateMany({
      where: { id: ligneId, avantProjetId: id, supprimee: false },
      data: { supprimee: true, supprimeLe: new Date(), supprimeParId: utilisateurId },
    });
    if (count === 0) throw new NotFoundException('Item de checklist introuvable');
    return versAvantProjet(await this.chargerAvantProjetComplet(id));
  }

  async validerAvantProjet(societeId: string, id: string, utilisateurId: string) {
    const projet = await this.charger(societeId, id);
    const ap = await this.prisma.avantProjet.findUnique({ where: { projetId: id } });
    if (!ap) throw new NotFoundException('Avant-projet introuvable');

    if (!checklistComplete(ap)) {
      throw new ConflictException('Checklist incomplète');
    }
    const versions = await this.versionsOrdonnees(id, projet.categorie);
    if (!preBilanComplet(projet.categorie, versions)) {
      throw new ConflictException('Pré-bilan incomplet');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.avantProjet.update({
        where: { projetId: id },
        data: { valideLe: new Date(), validePar: utilisateurId },
      });
      const data: { statut?: StatutProjet; phase?: Phase } = {};
      if (projet.statut === 'assigne') data.statut = 'en_cours';
      if (projet.phase === 'avant_projet') {
        data.phase = phaseApresAvantProjet(projet.categorie);
      }
      if (Object.keys(data).length) {
        await tx.projet.update({ where: { id }, data });
      }
    });

    return this.getAvantProjet(societeId, id);
  }

  async devaliderAvantProjet(societeId: string, id: string) {
    const projet = await this.charger(societeId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.avantProjet.update({
        where: { projetId: id },
        data: { valideLe: null, validePar: null },
      });
      if (projet.phase === phaseApresAvantProjet(projet.categorie)) {
        await tx.projet.update({ where: { id }, data: { phase: 'avant_projet' } });
      }
    });
    return this.getAvantProjet(societeId, id);
  }

  // -- Pré-bilan ---------------------------------------------------------

  async getPreBilan(societeId: string, id: string) {
    const projet = await this.charger(societeId, id);
    return {
      projetId: id,
      versions: await this.versionsOrdonnees(id, projet.categorie),
    };
  }

  async ajouterVersion(societeId: string, id: string) {
    const projet = await this.charger(societeId, id);
    const sequence = ETAPES_PRE_BILAN[projet.categorie];
    const versions = await this.versionsOrdonnees(id, projet.categorie);
    const suivante = sequence[versions.length];
    if (!suivante) {
      throw new ConflictException('Toutes les versions du pré-bilan existent déjà');
    }
    const precedente = versions[versions.length - 1];

    await this.prisma.$transaction(async (tx) => {
      if (precedente && !precedente.figeeLe) {
        await tx.versionPreBilan.update({
          where: { projetId_etape: { projetId: id, etape: precedente.etape } },
          data: { figeeLe: new Date() },
        });
      }
      await tx.versionPreBilan.create({
        data: {
          projetId: id,
          etape: suivante,
          couts: precedente?.couts ?? {},
          prixVenteEstime: precedente?.prixVenteEstime ?? null,
        },
      });
    });

    return this.getPreBilan(societeId, id);
  }

  async patchVersion(
    societeId: string,
    id: string,
    etape: string,
    dto: PatchVersionDto,
  ) {
    await this.charger(societeId, id);
    const version = await this.prisma.versionPreBilan.findUnique({
      where: { projetId_etape: { projetId: id, etape: etape as EtapePreBilan } },
    });
    if (!version) throw new NotFoundException('Version introuvable');
    if (version.figeeLe) throw new ConflictException('Version figée');

    await this.prisma.versionPreBilan.update({
      where: { projetId_etape: { projetId: id, etape: etape as EtapePreBilan } },
      data: { couts: dto.couts, prixVenteEstime: dto.prixVenteEstime ?? null },
    });
    return this.getPreBilan(societeId, id);
  }

  // -- Phase -----------------------------------------------------------

  async changerPhase(
    societeId: string,
    id: string,
    cible: Phase,
    parId?: string,
  ) {
    const projet = await this.charger(societeId, id);
    if (!phasesAdjacentes(projet.categorie, projet.phase, cible)) {
      throw new UnprocessableEntityException('Transition de phase non adjacente');
    }

    const maj = await this.prisma.projet.update({
      where: { id },
      data: { phase: cible },
      include: { client: true },
    });

    await this.notifier(() =>
      this.notifications.pousser({
        societeId,
        projet: { id: maj.id, code: maj.code, celluleId: maj.celluleId },
        type: 'phase_changee',
        titre: `${maj.programme} · passe en phase ${LIBELLES_PHASE[cible]}`,
        parId,
      }),
    );
    return versProjetExecution(maj);
  }

  // Fan-out de notifications en best-effort : un échec ne doit pas faire
  // échouer l'action métier (assignation / changement de phase).
  private async notifier(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      this.log.warn(
        `Notification non poussée : ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  // -- Internes ------------------------------------------------------

  private async charger(societeId: string, id: string) {
    const projet = await this.prisma.projet.findFirst({ where: { id, societeId } });
    if (!projet) throw new NotFoundException('Projet introuvable');
    return projet;
  }

  // En-tête 1:1 + les lignes de sous-checklist par défaut (créées une fois,
  // idempotent) — même motif que EtudesService.coquille.
  private async coquilleAvantProjet(projetId: string) {
    await this.prisma.avantProjet.upsert({
      where: { projetId },
      update: {},
      create: { projetId },
    });
    // Les lignes n'ont plus de clé unique (items libres, ajoutables par
    // projet) : l'idempotence de l'amorçage se vérifie par comptage plutôt
    // que par skipDuplicates sur une clé.
    const existantes = await this.prisma.ligneChecklistAvp.count({
      where: { avantProjetId: projetId },
    });
    if (existantes === 0) {
      await this.prisma.ligneChecklistAvp.createMany({
        data: GABARIT_CHECKLIST_AVP.map(({ groupe, libelle, ordre }) => ({
          avantProjetId: projetId,
          groupe,
          libelle,
          ordre,
        })),
      });
    }
    return this.chargerAvantProjetComplet(projetId);
  }

  private chargerAvantProjetComplet(projetId: string) {
    return this.prisma.avantProjet.findUniqueOrThrow({
      where: { projetId },
      include: {
        validateur: { select: { prenom: true, nom: true } },
        dessinateur: { select: { id: true, prenom: true, nom: true } },
        responsable3d: { select: { id: true, prenom: true, nom: true } },
        lignesChecklist: true,
      },
    });
  }

  private async versionsOrdonnees(projetId: string, categorie: Categorie) {
    const sequence = ETAPES_PRE_BILAN[categorie];
    const versions = await this.prisma.versionPreBilan.findMany({ where: { projetId } });
    return versions.sort(
      (a, b) => sequence.indexOf(a.etape) - sequence.indexOf(b.etape),
    );
  }
}
