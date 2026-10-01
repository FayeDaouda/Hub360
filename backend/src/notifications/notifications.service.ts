import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_DAF, ROLE_PROPRIETAIRE_DOSSIER } from '../crm/cycle';
import {
  ContexteNotificationCrm,
  DELAI_RELANCE_FICHE_MS,
  EvenementCrm,
  planNotificationsCrm,
  relanceFicheIncomplete,
} from '../crm/notifications-crm';

const MAX_STOCKEES = 30;

type ProjetContexte = {
  id: string;
  code: string;
  // Plusieurs cellules possibles depuis sept. 2026 (cf. ProjetCellule).
  celluleIds: string[];
};

// `derivee` : calculée à la volée plutôt que stockée, jamais « lue » — seule
// source aujourd'hui : la relance d'un lead CRM incomplet après 72 h. Son
// type n'existe pas en base (rien n'est stocké).
export type TypeAlerteDerivee = 'fiche_a_completer';

export type NotificationItem = {
  id: string; // uuid (stockée) ; « relance-fiche-<dossier> » (dérivée)
  type: NotificationType | TypeAlerteDerivee;
  titre: string;
  projetId: string | null;
  projetCode: string | null;
  dossierCrmId: string | null;
  factureId: string | null; // facture à valider (Finances)
  date: Date;
  lu: boolean;
  derivee: boolean;
};

@Injectable()
export class NotificationsService {
  private readonly log = new Logger('Notifications');
  constructor(private prisma: PrismaService) {}

  // -- Écriture : appelée par ProjetsService au moment de l'événement --------
  // Best-effort : un échec de fan-out ne doit pas faire échouer l'assignation
  // ou le changement de phase (try/catch côté appelant).
  async pousser(params: {
    societeId: string;
    projet: ProjetContexte;
    type: NotificationType;
    titre: string;
    parId?: string | null;
    // Cibles explicites (utilisateurId) — ex. assignation d'une tâche à une
    // personne, ou tous les admins d'une société (cf. adminsDeSociete
    // ci-dessous). Omis : diffusion à toute l'équipe du projet (comportement
    // historique, cellule + dessinateur/responsable3d).
    destinataireIds?: string[];
  }): Promise<void> {
    const destinataires =
      params.destinataireIds ??
      (await this.destinataires(params.societeId, params.projet, params.parId ?? null));
    if (destinataires.length === 0) return;

    await this.prisma.notification.createMany({
      data: destinataires.map((destinataireId) => ({
        destinataireId,
        societeId: params.societeId,
        type: params.type,
        projetId: params.projet.id,
        titre: params.titre,
        parId: params.parId ?? null,
      })),
    });
  }

  // -- Cycle CRM : qui prévenir à chaque étape (src/crm/notifications-crm.ts)
  // Appelée APRÈS la transaction de l'événement. Ne lève jamais : une
  // notification manquée ne doit pas faire échouer une validation DAF, une
  // réponse client ou une signature — l'échec est journalisé.
  //   · DAF          = titulaires du rôle ROLE_DAF de la société
  //   · propriétaire = le propriétaire du dossier ; « à assigner » → tous les
  //                    titulaires Dir. GC (l'un d'eux reprendra le dossier)
  //   · apporteur    = l'apporteur INTERNE (compte HUB) ; externe → personne
  async notifierDossierCrm(params: {
    societeId: string;
    dossierId: string;
    evenement: EvenementCrm;
    parId: string | null;
    commentaire?: string | null;
    projetId?: string | null;
    facturesPreparees?: number;
  }): Promise<void> {
    try {
      const { societeId, dossierId, evenement } = params;
      const d = await this.prisma.dossierCrm.findFirst({
        where: { id: dossierId, societeId },
        select: {
          code: true,
          programme: true,
          proprietaireId: true,
          apporteurType: true,
          apporteurUtilisateurId: true,
        },
      });
      if (!d) return;

      const [daf, dirGc] = await Promise.all([
        this.titulairesRole(societeId, ROLE_DAF),
        d.proprietaireId ? Promise.resolve([]) : this.titulairesRole(societeId, ROLE_PROPRIETAIRE_DOSSIER),
      ]);
      const ctx: ContexteNotificationCrm = {
        code: d.code,
        programme: d.programme,
        commentaire: params.commentaire,
        facturesPreparees: params.facturesPreparees,
      };
      const plan = planNotificationsCrm(
        evenement,
        ctx,
        {
          daf,
          proprietaire: d.proprietaireId ? [d.proprietaireId] : dirGc,
          apporteur:
            d.apporteurType === 'interne' && d.apporteurUtilisateurId
              ? [d.apporteurUtilisateurId]
              : [],
        },
        params.parId,
      );
      if (plan.length === 0) return;

      await this.prisma.notification.createMany({
        data: plan.map(({ destinataireId, titre }) => ({
          destinataireId,
          societeId,
          type: evenement,
          dossierCrmId: dossierId,
          projetId: params.projetId ?? null,
          titre,
          parId: params.parId,
        })),
      });
    } catch (e) {
      this.log.error(
        `Notification CRM « ${params.evenement} » non envoyée (dossier ${params.dossierId}) : ${(e as Error).message}`,
      );
    }
  }

  // Facture directe d'un lead préparée (maquette Finances) : le CFO est
  // prévenu qu'elle attend sa validation. Ne lève jamais : une notification
  // manquée ne doit pas faire échouer la préparation (l'échec est journalisé).
  async notifierFactureAValider(params: { societeId: string; factureId: string; dossierCrmId: string; titre: string }) {
    try {
      const cfo = await this.titulairesRole(params.societeId, ROLE_DAF);
      if (!cfo.length) return;
      await this.prisma.notification.createMany({
        data: cfo.map((destinataireId) => ({
          destinataireId,
          societeId: params.societeId,
          type: 'facture_a_valider' as const,
          factureId: params.factureId,
          dossierCrmId: params.dossierCrmId,
          titre: params.titre,
        })),
      });
    } catch (e) {
      this.log.error(`Facture à valider non notifiée (${params.factureId}) : ${e instanceof Error ? e.message : e}`);
    }
  }

  // Titulaires ACTIFS d'un rôle de la société (rôle non supprimé) — même
  // lecture que le choix du propriétaire dans CrmService.
  private async titulairesRole(societeId: string, nom: string): Promise<string[]> {
    const lignes = await this.prisma.utilisateurSocieteRole.findMany({
      where: {
        societeId,
        role: { societeId, nom, supprimeLe: null },
        utilisateur: { actif: true },
      },
      select: { utilisateurId: true },
    });
    return [...new Set(lignes.map((l) => l.utilisateurId))];
  }

  // -- Lecture : flux de l'utilisateur connecté -----------------------------
  // Alertes dérivées en tête (actives tant que leur condition tient, comptées
  // dans nonLues), puis les notifications stockées.
  async flux(societeId: string, utilisateurId: string) {
    const stockees = await this.prisma.notification.findMany({
      where: { destinataireId: utilisateurId, societeId },
      include: { projet: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
      take: MAX_STOCKEES,
    });

    const elementsStockes: NotificationItem[] = stockees.map((n) => ({
      id: n.id,
      type: n.type,
      titre: n.titre,
      projetId: n.projetId,
      projetCode: n.projet?.code ?? null,
      dossierCrmId: n.dossierCrmId,
      factureId: n.factureId,
      date: n.createdAt,
      lu: n.luLe !== null,
      derivee: false,
    }));

    const derivees = await this.relancesFiche(societeId, utilisateurId, new Date());
    const nonLues = derivees.length + elementsStockes.filter((e) => !e.lu).length;

    return { nonLues, elements: [...derivees, ...elementsStockes] };
  }

  // Leads « Nouveau projet » incomplets depuis plus de 72 h dont l'utilisateur
  // pilote la fiche — ou, « à assigner », s'il est titulaire Dir. GC (cf.
  // crm/notifications-crm.ts::relanceFicheIncomplete).
  private async relancesFiche(
    societeId: string,
    utilisateurId: string,
    maintenant: Date,
  ): Promise<NotificationItem[]> {
    const dirGc = await this.titulairesRole(societeId, ROLE_PROPRIETAIRE_DOSSIER);
    const dossiers = await this.prisma.dossierCrm.findMany({
      where: {
        societeId,
        statut: 'nouveau_projet',
        archiveLe: null,
        createdAt: { lte: new Date(maintenant.getTime() - DELAI_RELANCE_FICHE_MS) },
        OR: [
          { proprietaireId: utilisateurId },
          ...(dirGc.includes(utilisateurId) ? [{ proprietaireId: null }] : []),
        ],
      },
      select: {
        id: true,
        code: true,
        categorie: true,
        localiteId: true,
        type: true,
        surfaceTerrain: true,
        nbPlanches: true,
        clientId: true,
        standing: true,
        gamme: true,
        programme: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return dossiers.flatMap((d) => {
      const relance = relanceFicheIncomplete(d, maintenant);
      if (!relance) return [];
      return [
        {
          id: `relance-fiche-${d.id}`,
          type: 'fiche_a_completer' as const,
          titre: relance.titre,
          projetId: null,
          projetCode: null,
          dossierCrmId: d.id,
          factureId: null,
          date: relance.date,
          lu: false,
          derivee: true,
        },
      ];
    });
  }

  async marquerLues(societeId: string, utilisateurId: string) {
    await this.prisma.notification.updateMany({
      where: { destinataireId: utilisateurId, societeId, luLe: null },
      data: { luLe: new Date() },
    });
    return this.flux(societeId, utilisateurId);
  }

  // -- Internes -----------------------------------------------------------

  // utilisateurId des collaborateurs qui « suivent » le projet : membres de sa
  // cellule + dessinateur + responsable 3D, comptes existants seulement, hors
  // l'auteur de l'action.
  private async destinataires(
    societeId: string,
    projet: ProjetContexte,
    exclusId: string | null,
  ): Promise<string[]> {
    const ap = await this.prisma.avantProjet.findUnique({
      where: { projetId: projet.id },
      select: { dessinateurId: true, responsable3dId: true },
    });
    const collabIds = [ap?.dessinateurId, ap?.responsable3dId].filter(
      (v): v is string => !!v,
    );

    const ou: Prisma.CollaborateurWhereInput[] = [];
    if (projet.celluleIds.length) ou.push({ celluleId: { in: projet.celluleIds } });
    if (collabIds.length) ou.push({ id: { in: collabIds } });
    if (ou.length === 0) return [];

    const collabs = await this.prisma.collaborateur.findMany({
      where: { societeId, utilisateurId: { not: null }, OR: ou },
      select: { utilisateurId: true },
    });

    const ids = new Set<string>();
    for (const c of collabs) {
      if (c.utilisateurId && c.utilisateurId !== exclusId) ids.add(c.utilisateurId);
    }
    return [...ids];
  }

  // Tous les admins de la société — ex. alerte « demande de prolongation ».
  // N'importe quel societe_admin traite la demande (même logique que le
  // reste des actions admin sur ce module, pas de notion de « responsable »).
  async adminsDeSociete(societeId: string, exclusId?: string | null): Promise<string[]> {
    const roles = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId, role: { nom: 'societe_admin' } },
      select: { utilisateurId: true },
    });
    return [...new Set(roles.map((r) => r.utilisateurId))].filter((id) => id !== exclusId);
  }

}
