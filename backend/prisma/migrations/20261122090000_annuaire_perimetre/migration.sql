-- Annuaire (22/11/2026) : le changement de périmètre de l'annuaire entre au
-- journal d'audit comme une intervention de l'Administration du HUB ; le
-- dossier RH gagne un téléphone professionnel, seul montré dans l'annuaire.

-- AlterEnum
ALTER TYPE "TypeInterventionHub" ADD VALUE 'annuaire_perimetre';

-- AlterTable
ALTER TABLE "dossiers_personnel" ADD COLUMN     "telephone_pro" TEXT NOT NULL DEFAULT '';

