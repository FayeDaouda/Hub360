// Les scripts de démo vident puis recréent les données d'une société : lancés
// sur la base de production, ils effaceraient les vraies données. Refus en
// production, sauf autorisation explicite (pré-production) :
// HUB_DONNEES_DEMO=autorise.
export function verifierEnvironnementDemo(): void {
  if (process.env.NODE_ENV === 'production' && process.env.HUB_DONNEES_DEMO !== 'autorise') {
    console.error(
      'Refusé : données de démo en production (NODE_ENV=production). ' +
        'Pour une pré-production, définir HUB_DONNEES_DEMO=autorise.',
    );
    process.exit(1);
  }
}
