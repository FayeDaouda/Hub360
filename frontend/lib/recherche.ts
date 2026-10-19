import { apiSociete } from './client-api';

// GET /api/societes/:slug/recherche?q= — chaque type filtré côté serveur
// selon la matrice (lecture requise), périmètre Projets du Salarié compris.
export type TypeResultat = 'dossier' | 'projet' | 'devis' | 'facture' | 'salarie' | 'collegue';
export type ResultatRecherche = { type: TypeResultat; id: string; titre: string; detail: string };

export const chercher = (slug: string, q: string) =>
  apiSociete<ResultatRecherche[]>(slug, `/recherche?q=${encodeURIComponent(q)}`);

export const GROUPES: { type: TypeResultat; libelle: string }[] = [
  { type: 'dossier', libelle: 'Dossiers CRM' },
  { type: 'projet', libelle: 'Projets' },
  { type: 'devis', libelle: 'Devis' },
  { type: 'facture', libelle: 'Factures' },
  { type: 'salarie', libelle: 'Personnel' },
  { type: 'collegue', libelle: 'Collègues' },
];

// null : le résultat s'ouvre sur place (collègue → fiche contact).
export function lienResultat(slug: string, r: ResultatRecherche): string | null {
  const base = `/admin/${slug}`;
  switch (r.type) {
    case 'dossier':
      return `${base}/crm?dossier=${r.id}`;
    case 'projet':
      return `${base}/projets?projet=${r.id}`;
    case 'devis':
      return `${base}/facturation?devis=${r.id}`;
    case 'facture':
      return `${base}/facturation?facture=${r.id}`;
    case 'salarie':
      return `${base}/rh?dossier=${r.id}`;
    case 'collegue':
      return null;
  }
}
