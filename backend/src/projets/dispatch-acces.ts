import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { agitEnDirection } from './projet-acces';

// Deux voies pour un collaborateur non-admin d'assigner une ligne de
// checklist ou un responsable de bloc (l'admin passe toujours, déjà laissé
// passer par l'appelant) :
//  1. Auto-assignation sur une tâche/un bloc encore LIBRE (cibleActuelleId
//     null) — n'importe quel membre de l'équipe du projet peut se désigner
//     lui-même (l'appartenance à l'équipe est déjà vérifiée en amont par
//     AccesProjetGuard, donc pas revérifiée ici). Jamais écraser un
//     responsable déjà désigné par quelqu'un d'autre (décision boss, sept.
//     2026) — sinon deux collaborateurs pourraient se « voler » un bloc sans
//     que l'admin ou le dispatcher en soit informé avant coup.
//  2. Dispatcher (désigné par l'admin, cf. Cellule.dispatcherId) : assigne
//     n'importe qui, mais UNIQUEMENT un membre de SA PROPRE cellule — jamais
//     une autre, même si le projet réunit plusieurs équipes. `cibleId` = null
//     pour une désassignation, toujours permise au dispatcher de sa cellule.
export async function estAutoriseAAssigner(
  prisma: PrismaService,
  societeId: string,
  utilisateurId: string,
  cibleId: string | null,
  cibleActuelleId: string | null,
): Promise<boolean> {
  const acteur = await prisma.collaborateur.findFirst({
    where: { utilisateurId, societeId },
    select: { id: true, celluleId: true },
  });
  if (!acteur) return false;

  if (cibleActuelleId === null && cibleId === acteur.id) return true;

  if (!acteur.celluleId) return false;
  const cellule = await prisma.cellule.findUnique({
    where: { id: acteur.celluleId },
    select: { dispatcherId: true },
  });
  if (cellule?.dispatcherId !== acteur.id) return false;

  if (cibleId === null) return true;
  const cible = await prisma.collaborateur.findUnique({
    where: { id: cibleId },
    select: { celluleId: true },
  });
  return cible?.celluleId === acteur.celluleId;
}

// Qui peut modifier la STRUCTURE d'une checklist (ajouter/retirer un item) —
// distinct de estAutoriseAAssigner ci-dessus (qui désigne un responsable de
// bloc). Nouveauté du chantier Avant-projet (sept. 2026, décision boss) :
// admin OU dispatcher d'une cellule assignée à CE projet (n'importe laquelle
// s'il y en a plusieurs — modifier la structure de la checklist n'est pas
// scopé à « ses » tâches comme l'assignation). L'appelant a déjà vérifié
// l'admin en amont, même convention que les autres fonctions de ce fichier.
export async function estDispatcherDuneCelluleDuProjet(
  prisma: PrismaService,
  societeId: string,
  utilisateurId: string,
  celluleIdsProjet: string[],
): Promise<boolean> {
  if (celluleIdsProjet.length === 0) return false;
  const acteur = await prisma.collaborateur.findFirst({
    where: { utilisateurId, societeId },
    select: { id: true, celluleId: true },
  });
  if (!acteur?.celluleId || !celluleIdsProjet.includes(acteur.celluleId)) return false;
  const cellule = await prisma.cellule.findUnique({
    where: { id: acteur.celluleId },
    select: { dispatcherId: true },
  });
  return cellule?.dispatcherId === acteur.id;
}

// Contrepartie de estAutoriseAAssigner ci-dessus : celle-ci décide QUI peut
// DÉSIGNER un responsable, celle-ci décide qui peut AGIR une fois désigné.
// La direction passe toujours (admin ou rôle de la matrice, cf.
// agitEnDirection) ; sinon, seul le responsable exact du bloc —
// extrait de Permis/Exécution qui en avaient chacun leur propre copie
// identique (2026-09-25, ajouté pour Unbord plutôt que d'en écrire une 3ᵉ).
export async function verifierResponsableOuAdmin(
  prisma: PrismaService,
  societeId: string,
  utilisateurId: string,
  role: string,
  responsableId: string | null,
): Promise<void> {
  if (agitEnDirection(role)) return;
  const collab = await prisma.collaborateur.findFirst({
    where: { utilisateurId, societeId },
    select: { id: true },
  });
  if (!collab || !responsableId || collab.id !== responsableId) {
    throw new ForbiddenException(
      'Cette action est réservée au responsable désigné de ce bloc.',
    );
  }
}
