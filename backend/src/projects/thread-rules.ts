// Fil de discussion (maquette « Projets ») : « une @mention notifie la
// personne ; le commentaire reste ouvert jusqu'à une réponse ou sa résolution
// par l'auteur ». Règles pures, testées.

// mentions : nombre de personnes citées (@) dans le commentaire.
export type ThreadComment = { mentions: number; resoluLe: Date | null; reponses: number };

// Ouvert = une mention en attente : ni réponse, ni résolution.
export function isOpenComment(c: ThreadComment): boolean {
  return c.mentions > 0 && !c.resoluLe && c.reponses === 0;
}

// Seul l'auteur résout, et seulement un commentaire encore ouvert.
export function resolutionRefusal(c: ThreadComment & { auteurId: string | null }, actorId: string): string | null {
  if (c.auteurId !== actorId) return 'Seul l’auteur résout son commentaire.';
  if (!isOpenComment(c)) return 'Ce commentaire n’attend plus de réponse.';
  return null;
}
