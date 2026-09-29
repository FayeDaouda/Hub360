import { Prisma } from '@prisma/client';

// Dossier du personnel d'un compte HUB (lot 5) : relié directement
// (direction, salariés hors cellule) ou via la fiche d'équipe du
// collaborateur. Un dossier archivé (départ) ne donne plus accès à Mon espace.
export const ouDossierDuCompte = (utilisateurId: string): Prisma.DossierPersonnelWhereInput => ({
  archiveLe: null,
  OR: [{ utilisateurId }, { collaborateur: { utilisateurId } }],
});
