import { stripAccents } from '@hub/domain';
import type { OpenProjectSummary } from './types';

// Filtres rapides du sélecteur de projets (09/11/2026).
export type ProjectFilter = 'all' | 'late' | 'noTeam';

// Un projet « en retard » : une tâche hors délai ou la livraison dépassée.
export const isLate = (p: OpenProjectSummary) => p.livraisonDepassee || p.enRetard > 0;
// Sans équipe : personne n'y répartit le travail, aucun membre ne le voit.
export const hasNoTeam = (p: OpenProjectSummary) => !p.cellule;

// Rang d'urgence : livraison dépassée, puis tâches en retard, puis sans
// équipe, puis dans les délais.
function urgency(p: OpenProjectSummary): number {
  if (p.livraisonDepassee) return 0;
  if (p.enRetard > 0) return 1;
  if (hasNoTeam(p)) return 2;
  return 3;
}

// Texte cherché : code et client, accents et casse ignorés.
const fold = (s: string) => stripAccents(s).toLowerCase();

export function countProjects(projects: OpenProjectSummary[]) {
  return {
    total: projects.length,
    late: projects.filter(isLate).length,
    noTeam: projects.filter(hasNoTeam).length,
  };
}

// Projets proposés : filtre, recherche, puis tri par urgence (le plus de
// tâches en retard d'abord), à urgence égale par code.
export function visibleProjects(
  projects: OpenProjectSummary[],
  filter: ProjectFilter,
  query: string,
): OpenProjectSummary[] {
  const term = fold(query.trim());
  return projects
    .filter((p) => filter === 'all' || (filter === 'late' ? isLate(p) : hasNoTeam(p)))
    .filter((p) => !term || fold(`${p.code} ${p.client}`).includes(term))
    .sort((a, b) => urgency(a) - urgency(b) || b.enRetard - a.enRetard || a.code.localeCompare(b.code, 'fr'));
}
