// Colonnes de la grille du portail (attribut data-colonnes, lu en CSS) : une
// ligne jusqu'à 3 sociétés, 2×2 pour 4 (jamais 3 + 1 orpheline), puis lignes
// de 3 ; sur tablette, 3 passe en une colonne (globals.css). Module neutre (ni client ni
// serveur) : partagé par societe-grid et le squelette (portail/loading.tsx),
// pour que rien ne saute à l'arrivée des données.
export function colonnesPortail(nombre: number): number {
  if (nombre <= 3) return Math.max(nombre, 1);
  return nombre === 4 ? 2 : 3;
}
