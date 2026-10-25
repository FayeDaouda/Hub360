import type { PrismaService } from '../../prisma/prisma.service';
import { HEURES_PAR_JOUR, type Feries } from '../../rh/regles-temps';
import { dateDuJour } from './calendrier';
import { ROLE_CTO, ROLE_DPLG } from './validation';

// Suppléance et escalade (revue Dir. GC, 21/10/2026, lot 4) : qui décide et
// qui est prévenu AUJOURD'HUI, selon les absences validées.
//   · Un Dir. GC absent désigne un suppléant (autre Dir. GC ou CTO) ; sans
//     désignation, le CTO tient sa place.
//   · Un chef de team sans compte HUB, ou absent, ne bloque plus rien : ses
//     remises et prolongations remontent au Dir. GC (ou à son suppléant).
//   · Le travail d'un Dir. GC, les prolongations qui repoussent la livraison
//     et les TS au-delà du seuil remontent au CTO.

export type ContexteDecision = {
  // Fiches d'équipe reliées à un compte Dir. GC (leur travail : validé par le CTO).
  dplgCollaborateurs: Set<string>;
  // Le CTO agit comme Architecte DPLG : un Dir. GC est absent sans avoir
  // confié sa suppléance à un autre Dir. GC.
  ctoSupplee: boolean;
  // Absents aujourd'hui (absence validée) : comptes et fiches d'équipe.
  comptesAbsents: Set<string>;
  collaborateursAbsents: Set<string>;
  // Comptes à prévenir pour une décision d'Architecte DPLG, et pour le CTO.
  comptesDplg: string[];
  comptesCto: string[];
};

async function titulaires(prisma: PrismaService, societeId: string, role: string): Promise<string[]> {
  const l = await prisma.utilisateurSocieteRole.findMany({
    where: {
      societeId,
      role: { nom: role, supprimeLe: null, OR: [{ societeId }, { societeId: null }] },
      utilisateur: { actif: true },
    },
    select: { utilisateurId: true },
  });
  return [...new Set(l.map((x) => x.utilisateurId))];
}

export async function contexteDecision(
  prisma: PrismaService,
  societeId: string,
  jour: string,
): Promise<ContexteDecision> {
  const [dirGc, cto, absences] = await Promise.all([
    titulaires(prisma, societeId, ROLE_DPLG),
    titulaires(prisma, societeId, ROLE_CTO),
    prisma.demandeAbsence.findMany({
      where: { statut: 'validee', dateDebut: { lte: jour }, dateFin: { gte: jour }, dossier: { societeId } },
      select: { suppleantId: true, dossier: { select: { utilisateurId: true, collaborateurId: true } } },
    }),
  ]);
  const collabsDplg = dirGc.length
    ? await prisma.collaborateur.findMany({
        where: {
          societeId,
          OR: [{ utilisateurId: { in: dirGc } }, { dossierPersonnel: { utilisateurId: { in: dirGc } } }],
        },
        select: { id: true },
      })
    : [];
  const comptesAbsents = new Set(absences.map((a) => a.dossier.utilisateurId).filter((x): x is string => !!x));
  const collaborateursAbsents = new Set(absences.map((a) => a.dossier.collaborateurId).filter((x): x is string => !!x));
  // Dir. GC absents → leur suppléant (un compte), ou le CTO.
  const suppleants = new Map(
    absences
      .filter((a) => a.dossier.utilisateurId && dirGc.includes(a.dossier.utilisateurId))
      .map((a) => [a.dossier.utilisateurId!, a.suppleantId]),
  );
  const parDirGcAbsent = [...suppleants.values()].map((s) =>
    s && !comptesAbsents.has(s) && dirGc.includes(s) ? 'dir_gc' : 'cto',
  );
  const presents = dirGc.filter((id) => !comptesAbsents.has(id));
  const suppleantsDirGc = [...suppleants.values()].filter(
    (s): s is string => !!s && dirGc.includes(s) && !comptesAbsents.has(s),
  );
  const ctoSupplee = parDirGcAbsent.includes('cto') || (dirGc.length > 0 && presents.length === 0);
  return {
    dplgCollaborateurs: new Set(collabsDplg.map((c) => c.id)),
    ctoSupplee,
    comptesAbsents,
    collaborateursAbsents,
    comptesDplg: [...new Set([...presents, ...suppleantsDirGc, ...(ctoSupplee || !dirGc.length ? cto : [])])],
    comptesCto: cto,
  };
}

// Date de livraison d'un projet ouvert : le jour J de son horizon (budget
// atelier en heures, 8 h par jour ouvré). null tant que le projet n'est pas ouvert.
export const horizonProjet = (budgetHeures: number | null) =>
  Math.max(1, Math.round((budgetHeures ?? 320) / HEURES_PAR_JOUR));
export function dateLivraison(
  p: { ouvertLe: string | null; budgetHeures: number | null },
  feries: Feries,
): string | null {
  return p.ouvertLe ? dateDuJour(p.ouvertLe, horizonProjet(p.budgetHeures), feries) : null;
}
