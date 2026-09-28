import { NotFoundException } from '@nestjs/common';
import { Categorie, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Un projet « appartient » à un collaborateur si SA cellule (singulière — ça
// ne change pas) fait partie des cellules qui suivent ce projet (pluriel
// depuis sept. 2026, décision boss : « plusieurs équipes par projet »)
// OU s'il en est nommément le dessinateur / le responsable 3D sur l'avant-
// projet. Même prédicat des deux côtés : le `where` Prisma qui filtre la
// liste, et le test booléen du garde sur un projet chargé. Réutilisé par
// NotificationsService.echeancesDerivees() et CollaborateursService.indicateurs()
// plutôt que dupliqué — un seul endroit à faire évoluer.
type CollabAcces = { id: string; celluleId: string | null };

export function ouProjetsDuCollaborateur(
  collab: CollabAcces,
): Prisma.ProjetWhereInput[] {
  const ou: Prisma.ProjetWhereInput[] = [
    { avantProjet: { dessinateurId: collab.id } },
    { avantProjet: { responsable3dId: collab.id } },
  ];
  if (collab.celluleId) ou.push({ cellules: { some: { celluleId: collab.celluleId } } });
  return ou;
}

export function estProjetDuCollaborateur(
  projet: {
    cellules: { celluleId: string }[];
    avantProjet: { dessinateurId: string | null; responsable3dId: string | null } | null;
  },
  collab: CollabAcces,
): boolean {
  return (
    (collab.celluleId != null &&
      projet.cellules.some((c) => c.celluleId === collab.celluleId)) ||
    projet.avantProjet?.dessinateurId === collab.id ||
    projet.avantProjet?.responsable3dId === collab.id
  );
}

// Charge un projet en vérifiant qu'il appartient bien à la société du token
// (cloisonnement multi-société). `categorieRequise` : renvoie 404 si la section
// n'existe pas pour ce projet — le permis et les études sont propres à la
// conception, l'aménagement ne les a pas. `cellules` toujours inclus (léger,
// et évite qu'un appelant oublie de le demander quand il en a besoin).
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

// Qui agit « en direction » dans un service projet (assigner n'importe qui,
// agir sur n'importe quel bloc, modifier la structure d'une checklist) :
// societe_admin, ou un rôle de la matrice (Dir. GC, CTO…). Sûr parce que ces
// services ne sont atteints QUE derrière AccesProjetGuard + PermissionGuard :
// un rôle autre que collaborateur arrivé ici est soit l'admin, soit un rôle
// ayant le niveau requis sur « projets » (écriture pour toute écriture).
// Le collaborateur, lui, reste borné à sa cellule / aux blocs dont il est
// responsable.
export function agitEnDirection(role: string): boolean {
  return role !== 'collaborateur';
}
