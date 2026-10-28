import { addDays, ROLE_CTO, ROLE_DIR_GC } from '@hub/domain';
import type { PrismaService } from '../prisma/prisma.service';
import { HEURES_PAR_JOUR, type Feries } from '../rh/regles-temps';
import { dateOfDay } from './work-calendar';

// Suppléance et escalade (revue Dir. GC, 21/10/2026, lot 4) : qui décide et
// qui est prévenu AUJOURD'HUI, selon les absences validées.
//   · Un Dir. GC absent désigne un suppléant (autre Dir. GC ou CTO) ; sans
//     désignation, le CTO tient sa place.
//   · Un chef de team sans compte HUB, ou absent, ne bloque plus rien : ses
//     remises et prolongations remontent au Dir. GC (ou à son suppléant).
//   · Le travail d'un Dir. GC, les prolongations qui repoussent la livraison
//     et les TS au-delà du seuil remontent au CTO.

export type DecisionContext = {
  // Fiches d'équipe reliées à un compte Dir. GC (leur travail : validé par le CTO).
  dplgEmployees: Set<string>;
  // Le CTO agit comme Architecte DPLG : un Dir. GC est absent sans avoir
  // confié sa suppléance à un autre Dir. GC.
  ctoStandsIn: boolean;
  // Absents aujourd'hui (absence validée) : comptes et fiches d'équipe.
  absentAccounts: Set<string>;
  absentEmployees: Set<string>;
  // Comptes à prévenir pour une décision d'Architecte DPLG, et pour le CTO.
  dplgAccounts: string[];
  ctoAccounts: string[];
};

async function holdersOf(prisma: PrismaService, companyId: string, role: string): Promise<string[]> {
  const l = await prisma.utilisateurSocieteRole.findMany({
    where: {
      societeId: companyId,
      role: { nom: role, supprimeLe: null, OR: [{ societeId: companyId }, { societeId: null }] },
      utilisateur: { actif: true },
    },
    select: { utilisateurId: true },
  });
  return [...new Set(l.map((x) => x.utilisateurId))];
}

export async function decisionContext(prisma: PrismaService, companyId: string, day: string): Promise<DecisionContext> {
  const [dirGcIds, ctoIds, absences] = await Promise.all([
    holdersOf(prisma, companyId, ROLE_DIR_GC),
    holdersOf(prisma, companyId, ROLE_CTO),
    prisma.demandeAbsence.findMany({
      where: { statut: 'validee', dateDebut: { lte: day }, dateFin: { gte: day }, dossier: { societeId: companyId } },
      select: { suppleantId: true, dossier: { select: { utilisateurId: true, collaborateurId: true } } },
    }),
  ]);
  const dplgRows = dirGcIds.length
    ? await prisma.collaborateur.findMany({
        where: {
          societeId: companyId,
          OR: [{ utilisateurId: { in: dirGcIds } }, { dossierPersonnel: { utilisateurId: { in: dirGcIds } } }],
        },
        select: { id: true },
      })
    : [];
  const absentAccounts = new Set(absences.map((a) => a.dossier.utilisateurId).filter((x): x is string => !!x));
  const absentEmployees = new Set(absences.map((a) => a.dossier.collaborateurId).filter((x): x is string => !!x));
  // Dir. GC absents → leur suppléant (un compte), ou le CTO.
  const standIns = new Map(
    absences
      .filter((a) => a.dossier.utilisateurId && dirGcIds.includes(a.dossier.utilisateurId))
      .map((a) => [a.dossier.utilisateurId!, a.suppleantId]),
  );
  const coverForAbsent = [...standIns.values()].map((s) =>
    s && !absentAccounts.has(s) && dirGcIds.includes(s) ? 'dir_gc' : 'cto',
  );
  const presentDirGc = dirGcIds.filter((id) => !absentAccounts.has(id));
  const dirGcStandIns = [...standIns.values()].filter(
    (s): s is string => !!s && dirGcIds.includes(s) && !absentAccounts.has(s),
  );
  const ctoStandsIn = coverForAbsent.includes('cto') || (dirGcIds.length > 0 && presentDirGc.length === 0);
  return {
    dplgEmployees: new Set(dplgRows.map((c) => c.id)),
    ctoStandsIn,
    absentAccounts,
    absentEmployees,
    dplgAccounts: [...new Set([...presentDirGc, ...dirGcStandIns, ...(ctoStandsIn || !dirGcIds.length ? ctoIds : [])])],
    ctoAccounts: ctoIds,
  };
}

// Date de livraison d'un projet ouvert : le jour J de son horizon (budget
// atelier en heures, 8 h par jour ouvré). null tant que le projet n'est pas ouvert.
export const projectHorizon = (budgetHeures: number | null) =>
  Math.max(1, Math.round((budgetHeures ?? 320) / HEURES_PAR_JOUR));
export function deliveryDate(
  p: { ouvertLe: string | null; budgetHeures: number | null },
  holidays: Feries,
): string | null {
  return p.ouvertLe ? dateOfDay(p.ouvertLe, projectHorizon(p.budgetHeures), holidays) : null;
}

// Livraison proche (tableau de production) : projet pas encore livré, livré
// au plus tard dans 15 jours, pas déjà en retard de livraison.
export function isDeliverySoon(siteStatus: string, deliveryOn: string, today: string): boolean {
  return siteStatus !== 'livre' && deliveryOn >= today && deliveryOn <= addDays(today, 15);
}
