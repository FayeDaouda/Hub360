import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_PROPRIETAIRE_DOSSIER } from '../crm/cycle';
import {
  ContexteNotificationCrm,
  DELAI_RELANCE_FICHE_MS,
  EvenementCrm,
  planNotificationsCrm,
  relanceFicheIncomplete,
} from '../crm/notifications-crm';
import { ROLE_CFO } from '@hub/domain';

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

  // -- Écriture : appelée par les services Projets au moment de l'événement --
  // Best-effort : un échec de fan-out ne doit pas faire échouer l'action
  // (try/catch côté appelant).
  async pousser(params: {
    societeId: string;
    projet: ProjetContexte;
    type: NotificationType;
    titre: string;
    parId?: string | null;
    destinataireIds: string[]; // utilisateurId ciblés (assigné, mentionné…)
  }): Promise<void> {
    const destinataires = params.destinataireIds;
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
  //   · DAF          = titulaires du rôle CFO de la société
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
          creeParId: true,
        },
      });
      if (!d) return;

      const [daf, dirGc] = await Promise.all([
        this.titulairesRole(societeId, ROLE_CFO),
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
          apporteur: d.apporteurType === 'interne' && d.apporteurUtilisateurId ? [d.apporteurUtilisateurId] : [],
          createur: d.creeParId ? [d.creeParId] : [],
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
      const cfo = await this.titulairesRole(params.societeId, ROLE_CFO);
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
  // Titulaires actifs d'un rôle dans la société — rôle propre à la société
  // ou rôle transverse (CEO, CTO, CIO : societeId null) attribué dans celle-ci.
  async titulairesRole(societeId: string, nom: string): Promise<string[]> {
    const lignes = await this.prisma.utilisateurSocieteRole.findMany({
      where: {
        societeId,
        role: { nom, supprimeLe: null, OR: [{ societeId }, { societeId: null }] },
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
  private async relancesFiche(societeId: string, utilisateurId: string, maintenant: Date): Promise<NotificationItem[]> {
    const dirGc = await this.titulairesRole(societeId, ROLE_PROPRIETAIRE_DOSSIER);
    const dossiers = await this.prisma.dossierCrm.findMany({
      where: {
        societeId,
        statut: 'nouveau_projet',
        archiveLe: null,
        createdAt: { lte: new Date(maintenant.getTime() - DELAI_RELANCE_FICHE_MS) },
        OR: [{ proprietaireId: utilisateurId }, ...(dirGc.includes(utilisateurId) ? [{ proprietaireId: null }] : [])],
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

  // Envoi générique (phase 3) : destinataires explicites, auteur exclu,
  // contexte cliquable facultatif. Ne lève jamais — une notification
  // manquée ne doit pas faire échouer l'action qui la déclenche.
  async envoyer(params: {
    societeId: string;
    type: NotificationType;
    titre: string;
    destinataireIds: (string | null | undefined)[];
    parId?: string | null;
    projetId?: string | null;
    factureId?: string | null;
    dossierCrmId?: string | null;
  }): Promise<number> {
    const ids = [...new Set(params.destinataireIds.filter((x): x is string => !!x && x !== params.parId))];
    if (!ids.length) return 0;
    try {
      const { count } = await this.prisma.notification.createMany({
        data: ids.map((destinataireId) => ({
          destinataireId,
          societeId: params.societeId,
          type: params.type,
          titre: params.titre,
          parId: params.parId ?? null,
          projetId: params.projetId ?? null,
          factureId: params.factureId ?? null,
          dossierCrmId: params.dossierCrmId ?? null,
        })),
      });
      return count;
    } catch (e) {
      this.log.error(`Notification ${params.type} non envoyée : ${e instanceof Error ? e.message : e}`);
      return 0;
    }
  }

  // Comptes (utilisateurId) des fiches d'équipe données — sans compte : rien.
  async comptesDe(collaborateurIds: (string | null | undefined)[]): Promise<string[]> {
    const ids = collaborateurIds.filter((x): x is string => !!x);
    if (!ids.length) return [];
    const c = await this.prisma.collaborateur.findMany({ where: { id: { in: ids } }, select: { utilisateurId: true } });
    return c.map((x) => x.utilisateurId).filter((x): x is string => !!x);
  }

  // `types` : seulement ces notifications (onglet de Mon espace ouvert).
  async marquerLues(societeId: string, utilisateurId: string, types?: NotificationType[], ids?: string[]) {
    await this.prisma.notification.updateMany({
      where: {
        destinataireId: utilisateurId,
        societeId,
        luLe: null,
        ...(types?.length && { type: { in: types } }),
        ...(ids?.length && { id: { in: ids } }),
      },
      data: { luLe: new Date() },
    });
    return this.flux(societeId, utilisateurId);
  }

  // Non lues par type (pastilles des onglets de Mon espace) : compté en
  // base, pas sur le flux limité aux dernières.
  async nonLuesParType(societeId: string, utilisateurId: string): Promise<Partial<Record<NotificationType, number>>> {
    const g = await this.prisma.notification.groupBy({
      by: ['type'],
      where: { destinataireId: utilisateurId, societeId, luLe: null },
      _count: true,
    });
    return Object.fromEntries(g.map((x) => [x.type, x._count]));
  }

  // Compte HUB d'un dossier du personnel (relié directement, ou via sa fiche d'équipe).
  async compteDuDossier(dossierId: string): Promise<string | null> {
    const d = await this.prisma.dossierPersonnel.findUnique({
      where: { id: dossierId },
      select: { utilisateurId: true, collaborateur: { select: { utilisateurId: true } } },
    });
    return d?.utilisateurId ?? d?.collaborateur?.utilisateurId ?? null;
  }
}
