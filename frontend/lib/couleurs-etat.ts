// Couleur = sens (décision du 12/10/2026) : l'état d'une tuile KPI. Depuis le
// lot 2 de l'audit UX (23/10/2026), il ne teinte que la pastille d'icône ;
// la première tuile « risque » d'un bandeau passe en aplat rouge (cf.
// components/admin/kpi-strip.tsx). Partagé par Pilotage, Finances, CRM, RH,
// Projets.
//  · risque    : au moins un élément en retard ou hors objectif ;
//  · attention : à surveiller, à traiter dans les délais ;
//  · succes    : objectif atteint, rien en retard ;
//  · marque    : chiffre sans objectif (neutre).
export type EtatTuile = 'risque' | 'attention' | 'succes' | 'marque';

// Mêmes règles que backend/src/pilotage/chiffres.service.ts.
export const etatATraiter = (n: number): EtatTuile => (n > 0 ? 'attention' : 'succes');
export const etatEnRetard = (n: number): EtatTuile => (n > 0 ? 'risque' : 'succes');
// Rouge si un délai est dépassé, ambre s'il reste à traiter dans les délais.
export const etatSelonDelai = (total: number, depasses: number): EtatTuile =>
  depasses > 0 ? 'risque' : etatATraiter(total);

// Délais du cycle CRM : fiche à compléter sous 72 h (relance du HUB),
// offre validée par le CFO sous 48 h (tuile de la maquette).
export const DELAI_FICHE_MS = 72 * 3600 * 1000;
export const DELAI_CFO_MS = 48 * 3600 * 1000;
