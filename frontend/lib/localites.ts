import type { Localite, NouvelleLocalitePayload } from './types';
import { apiSociete } from './client-api';

// Référentiel des localités — API NestJS (societe_admin ou CIO) :
//   GET   /api/societes/:slug/localites
//   POST  /api/societes/:slug/localites        (direction uniquement)
//   PATCH /api/societes/:slug/localites/:id    (code figé si déjà utilisé)
// La liste est globale au HUB ; le slug ne sert qu'au contrôle d'accès.

export function getLocalites(slug: string): Promise<Localite[]> {
  return apiSociete<Localite[]>(slug, '/localites');
}

export function creerLocalite(slug: string, payload: NouvelleLocalitePayload): Promise<Localite> {
  return apiSociete<Localite>(slug, '/localites', { method: 'POST', body: payload });
}

export function modifierLocalite(
  slug: string,
  id: string,
  payload: Partial<Omit<NouvelleLocalitePayload, 'zone'>>,
): Promise<Localite> {
  return apiSociete<Localite>(slug, `/localites/${id}`, { method: 'PATCH', body: payload });
}

// Minuscules sans accents — la recherche doit trouver « Sacré-Cœur » en
// tapant « sacre coeur » et « Yène » en tapant « yene ».
export function normaliserRecherche(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/gi, 'oe')
    .toLowerCase();
}

// Proposition de code pour une nouvelle localité : les 3 premières lettres
// du nom, sans accents ni séparateurs (« Sacré-Cœur » → SAC). Simple
// suggestion — en cas de collision, c'est la direction qui ajuste, jamais
// une résolution automatique (règle validée, sept. 2026).
export function proposerCodeLocalite(nom: string): string {
  return normaliserRecherche(nom)
    .replace(/[^a-z]/g, '')
    .slice(0, 3)
    .toUpperCase();
}
