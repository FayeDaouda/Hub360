import { SetMetadata } from '@nestjs/common';

export const ECRITURE_COLLABORATEUR = 'ecritureCollaborateur';

// Marque un endpoint d'écriture comme ouvert au collaborateur ASSIGNÉ au projet
// (matrice de droits — document de référence « Matrice de droits »).
// AccesProjetGuard rejette (403) toute écriture d'un collaborateur sur un
// endpoint NON marqué ; sur un endpoint marqué, la vérification de périmètre
// (projet suivi par la cellule / dessinateur / responsable 3D) s'applique
// comme pour les lectures.
export const EcritureCollaborateur = () =>
  SetMetadata(ECRITURE_COLLABORATEUR, true);
