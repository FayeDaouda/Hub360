// Fil de discussion (maquette « Projets ») : « une @mention notifie la
// personne ; le commentaire reste ouvert jusqu'à une réponse ou sa résolution
// par l'auteur ». Règles pures, testées.

export type CommentaireFil = { mentionneId: string | null; resoluLe: Date | null; reponses: number };

// Ouvert = une mention en attente : ni réponse, ni résolution.
export function estOuvert(c: CommentaireFil): boolean {
  return !!c.mentionneId && !c.resoluLe && c.reponses === 0;
}

// Seul l'auteur résout, et seulement un commentaire encore ouvert.
export function motifRefusResolution(c: CommentaireFil & { auteurId: string | null }, acteurId: string): string | null {
  if (c.auteurId !== acteurId) return 'Seul l’auteur résout son commentaire.';
  if (!estOuvert(c)) return 'Ce commentaire n’attend plus de réponse.';
  return null;
}
