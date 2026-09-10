import type { PeriodeTableauBord, TableauBordSociete } from './types';
import { apiSociete } from './client-api';

// Tableau de bord back-office d'une société.
//   GET …/tableau-de-bord?periode=jour|semaine|mois|annee   (societe_admin)
//
// Le NestJS est la source de vérité unique (cible multi-plateforme : web,
// desktop, iOS consomment la même API). Les KPI sont des photos à l'instant T
// — le contrat ne porte pas de « variation » quand il n'y a pas d'historique
// fiable en base ; le composant affiche alors le `detail`.

export function getTableauBordSociete(
  slug: string,
  periode: PeriodeTableauBord = 'mois',
): Promise<TableauBordSociete> {
  return apiSociete<TableauBordSociete>(slug, `/tableau-de-bord?periode=${periode}`);
}
