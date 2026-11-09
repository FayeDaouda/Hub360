import { JalonFacture, Phase, Prisma } from '@prisma/client';
import { toIsoDay } from '@hub/domain';

// Lecture des projets ouverts selon le gabarit (maquette « Projets » du
// boss) : ce que partagent le tableau, le dossier, la production et les
// alertes — la requête des cartes et tâches, et les petites règles de lecture.

export const WITH_TASKS = {
  cartes: {
    orderBy: { ordre: 'asc' },
    include: {
      taches: {
        orderBy: { ordre: 'asc' },
        include: {
          assigne: {
            select: { id: true, prenom: true, nom: true, celluleId: true, cellule: { select: { nom: true } } },
          },
          valideePar: { select: { prenom: true, nom: true } },
          prolongations: { orderBy: { demandeLe: 'desc' } },
          pieces: {
            orderBy: [{ version: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, nom: true, version: true },
          },
          devisTs: {
            select: {
              id: true,
              statut: true,
              dateValidite: true,
              dateEnvoi: true,
              numero: true,
              codeDossier: true,
              rangDossier: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProjetInclude;

export type ProjectWithTasks = Prisma.ProjetGetPayload<{ include: typeof WITH_TASKS }>;
// `permissions` : droits par étape (matrice), relus à chaque requête.
export type Actor = { userId: string; role: string; permissions?: Record<string, string> };

export const fullName = (p: { prenom: string; nom: string } | null | undefined) => (p ? `${p.prenom} ${p.nom}` : null);
export const isoDay = (d: Date | null) => (d ? toIsoDay(d) : null);
// Numéro de remise affiché (« v03 »), le même que dans le nom des fichiers déposés.
export const versionLabel = (version: number) => `v${String(version).padStart(2, '0')}`;

// Chef d’équipe d'un projet : le dispatcher de sa cellule (la première).
export const CHIEF_CELL = {
  take: 1,
  select: { cellule: { select: { dispatcherId: true } } },
} satisfies Prisma.Projet$cellulesArgs;
export const chiefOf = (p: { cellules?: { cellule: { dispatcherId: string | null } }[] }) =>
  p.cellules?.[0]?.cellule.dispatcherId ?? null;

type Extensions = ProjectWithTasks['cartes'][number]['taches'][number]['prolongations'];
// Dernière prolongation accordée (date jusqu'à laquelle le retard est qualifié)
// et demande en attente de décision.
export const grantedExtension = (l: Extensions) => l.find((p) => p.decision === 'accordee')?.jusquau ?? null;
export const pendingExtension = (l: Extensions) => l.find((p) => p.decision === null) ?? null;

// Cartes clés suivies dans « À venir » du tableau de production.
export const KEY_CARDS = ['permis_construire', 'pe_architecture', 'tache_finale'];

const INVOICE_MILESTONES: Record<'F1' | 'F2' | 'F3', JalonFacture> = {
  F1: 'signature',
  F2: 'avant_projet',
  F3: 'livraison',
};
// Factures d'un projet rattachées à une tranche (F1 à F3).
export const invoicesOf = <T extends { jalon: JalonFacture | null }>(invoices: T[], tranche: 'F1' | 'F2' | 'F3') =>
  invoices.filter((x) => x.jalon === INVOICE_MILESTONES[tranche]);
// État d'une tranche : émise dès qu'une de ses factures l'est, sinon en brouillon, sinon absente.
// Statut d'une tranche de facturation : émise, en brouillon, ou pas encore créée.
export type TrancheStatus = 'emise' | 'brouillon' | 'absente';
export function trancheStatus(
  invoices: { jalon: JalonFacture | null; statut: string }[],
  tranche: 'F1' | 'F2' | 'F3',
): TrancheStatus {
  const of = invoicesOf(invoices, tranche);
  return of.some((x) => x.statut === 'emise') ? 'emise' : of.length ? 'brouillon' : 'absente';
}

export type SiteStatus = 'conception' | 'chantier' | 'livre';
export function siteStatus(phase: Phase): SiteStatus {
  return phase === 'chantier' || phase === 'livre' ? phase : 'conception';
}

// Libellé d'un élément ajouté en TS, selon l'unité de la carte (gabarit).
export const TS_UNITS: Record<'pièce' | 'vue', string> = { pièce: 'Pièce intérieure', vue: 'Vue de détail' };

// Carte du gabarit dont les tâches sont dues 24 h après la visite sur site.
export const SURVEY_CARD = 'releves_existants';
