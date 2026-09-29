import type { ModePaiementSalaire, ProfilMonEspace, TypePieceDossier } from './types';
import { apiSociete } from './client-api';

// RH · Mon espace (lot 5) — API NestJS, dossier du compte connecté :
//   GET   …/mon-espace                  { dossier | null }
//   PATCH …/mon-espace/coordonnees      { telephone?, contactUrgence? }
//   GET   …/mon-espace/documents/:type  { nom, url }

export const getMonEspace = (slug: string) => apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace');
export const majCoordonnees = (slug: string, corps: { telephone?: string; contactUrgence?: string }) =>
  apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace/coordonnees', { method: 'PATCH', body: corps });

export async function telechargerDocument(slug: string, type: TypePieceDossier) {
  const f = await apiSociete<{ nom: string; url: string }>(slug, `/mon-espace/documents/${type}`);
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.nom;
  a.click();
}

export const LIBELLE_PAIEMENT_SALAIRE: Record<ModePaiementSalaire, string> = {
  virement: 'Virement',
  wave: 'Wave',
  orange_money: 'Orange Money',
};
