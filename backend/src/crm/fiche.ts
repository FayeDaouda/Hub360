// Complétude de la fiche d'un dossier CRM (maquette du boss) : neuf champs
// depuis le 09/11/2026 (le type de projet a laissé place à la forme bâtie de
// la Fiche Programme : le champ « programme » n'est rempli que par le résumé
// d'une Fiche Programme complète, forme comprise — jamais saisi),
// miroir de frontend/lib/crm.ts::completudeFiche. Un lead peut être créé
// incomplet ; l'offre ne se crée, et le dossier ne se soumet au CFO, que sur
// une fiche complète — elle se verrouille à la soumission, incomplète elle
// le resterait.

export type ChampsFiche = {
  code: string;
  categorie: string | null;
  localiteId: string | null;
  surfaceTerrain: number;
  nbPlanches: number;
  clientId: string;
  standing: string | null;
  gamme: string | null;
  programme: string;
};

export const TOTAL_CHAMPS_FICHE = 9;

export function champsManquants(d: ChampsFiche): string[] {
  const champs: [string, boolean][] = [
    ['code projet', !!d.code],
    ['catégorie', !!d.categorie],
    ['localisation', !!d.localiteId],
    ['surface du terrain', d.surfaceTerrain > 0],
    ['n° de planches', d.nbPlanches > 0],
    ['client', !!d.clientId],
    ['standing', !!d.standing],
    ['gamme', !!d.gamme],
    ['programme', !!d.programme.trim()],
  ];
  return champs.filter(([, ok]) => !ok).map(([nom]) => nom);
}

// null = fiche complète ; sinon le message à opposer.
export function motifFicheIncomplete(d: ChampsFiche, pour: string): string | null {
  const manquants = champsManquants(d);
  if (!manquants.length) return null;
  const faits = TOTAL_CHAMPS_FICHE - manquants.length;
  return `Fiche ${faits}/${TOTAL_CHAMPS_FICHE} : il manque ${manquants.join(', ')} — complète-la ${pour}.`;
}
