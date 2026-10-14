import { NotFoundException } from '@nestjs/common';
import { Categorie } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Charge un projet en vérifiant qu'il appartient bien à la société du token
// (cloisonnement multi-société). `categorieRequise` : renvoie 404 si le
// projet n'est pas de cette catégorie. `cellules` toujours inclus (léger, et
// évite qu'un appelant oublie de le demander quand il en a besoin).
export async function chargerProjet(
  prisma: PrismaService,
  societeId: string,
  projetId: string,
  categorieRequise?: Categorie,
) {
  const projet = await prisma.projet.findFirst({
    where: { id: projetId, societeId },
    include: { cellules: true },
  });
  if (!projet) throw new NotFoundException('Projet introuvable');
  if (categorieRequise && projet.categorie !== categorieRequise) {
    throw new NotFoundException("Cette section n'existe pas pour ce projet");
  }
  return projet;
}
