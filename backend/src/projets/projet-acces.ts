import { NotFoundException } from '@nestjs/common';
import { Categorie, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Un projet « appartient » à un collaborateur s'il est suivi par sa cellule
// (« 1 projet = 1 cellule ») OU s'il en est nommément le dessinateur / le
// responsable 3D sur l'avant-projet. Même prédicat des deux côtés : le `where`
// Prisma qui filtre la liste, et le test booléen du garde sur un projet chargé.
// Miroir du calcul de CollaborateursService.indicateurs().
type CollabAcces = { id: string; celluleId: string | null };

export function ouProjetsDuCollaborateur(
  collab: CollabAcces,
): Prisma.ProjetWhereInput[] {
  const ou: Prisma.ProjetWhereInput[] = [
    { avantProjet: { dessinateurId: collab.id } },
    { avantProjet: { responsable3dId: collab.id } },
  ];
  if (collab.celluleId) ou.push({ celluleId: collab.celluleId });
  return ou;
}

export function estProjetDuCollaborateur(
  projet: {
    celluleId: string | null;
    avantProjet: { dessinateurId: string | null; responsable3dId: string | null } | null;
  },
  collab: CollabAcces,
): boolean {
  return (
    (collab.celluleId != null && projet.celluleId === collab.celluleId) ||
    projet.avantProjet?.dessinateurId === collab.id ||
    projet.avantProjet?.responsable3dId === collab.id
  );
}

// Charge un projet en vérifiant qu'il appartient bien à la société du token
// (cloisonnement multi-société). `categorieRequise` : renvoie 404 si la section
// n'existe pas pour ce projet — le permis et les études sont propres à la
// conception, l'aménagement ne les a pas.
export async function chargerProjet(
  prisma: PrismaService,
  societeId: string,
  projetId: string,
  categorieRequise?: Categorie,
) {
  const projet = await prisma.projet.findFirst({
    where: { id: projetId, societeId },
  });
  if (!projet) throw new NotFoundException('Projet introuvable');
  if (categorieRequise && projet.categorie !== categorieRequise) {
    throw new NotFoundException("Cette section n'existe pas pour ce projet");
  }
  return projet;
}
