// Couleur = sens (décision du 12/10/2026) pour les tuiles en dégradé : seule
// la teinte suit l'état, le style dégradé reste. Partagé par le Pilotage,
// puis Finances, CRM et RH.
//  · risque    : au moins un élément en retard ou hors objectif ;
//  · attention : à surveiller, à traiter dans les délais ;
//  · succes    : objectif atteint, rien en retard ;
//  · marque    : chiffre sans objectif (iris, couleur de marque du HUB).
// Texte blanc ≥ 3,7:1 sur la teinte claire, ≥ 5,7:1 sur la foncée.
export type EtatTuile = 'risque' | 'attention' | 'succes' | 'marque';

export const DEGRADE_ETAT: Record<EtatTuile, { a: string; b: string }> = {
  risque: { a: '#b3372f', b: '#d0544a' },
  attention: { a: '#94560a', b: '#b57414' },
  succes: { a: '#26734a', b: '#3a9462' },
  marque: { a: '#6b2fb8', b: '#8c55d6' },
};
