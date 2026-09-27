// Refacturation des études techniques (étape H3, CGV Grey Concrete art. 5 +
// catalogue ET — décisions du 27/09/2026). Pur, sans I/O.
//
//   · une facture au client, une LIGNE par étude (option B, CGV : « lignes
//     distinctes de la facture ») ;
//   · montant de la ligne = montant HT facturé par le bureau × 1,10 — la
//     coordination est DANS la ligne (formule du catalogue), pas à part ;
//   · le bureau n'est réglé qu'APRÈS encaissement du client : « à régler »
//     se déduit de la facture soldée, seul le règlement effectif est saisi.

export const TAUX_COORDINATION_ET = 10; // % — catalogue « taux_coordination_pct »

export function montantRefacture(montantBureauHt: number): number {
  return Math.round((montantBureauHt * (100 + TAUX_COORDINATION_ET)) / 100);
}

export type StatutReglementBureau =
  | 'non_refacture' // pas (ou plus : facture annulée) de refacturation active
  | 'en_attente_encaissement' // refacturée, le client n'a pas encore tout payé
  | 'a_regler' // client encaissé → Grey Concrete peut régler le bureau
  | 'regle';

export function statutReglementBureau(bloc: {
  bureauRegleLe: Date | null;
  // Statut effectif de la facture qui porte sa ligne ACTIVE (ni annulée, ni
  // avoir), null s'il n'y en a pas.
  factureActive: string | null;
}): StatutReglementBureau {
  if (bloc.bureauRegleLe) return 'regle';
  if (!bloc.factureActive) return 'non_refacture';
  return bloc.factureActive === 'payee' ? 'a_regler' : 'en_attente_encaissement';
}
