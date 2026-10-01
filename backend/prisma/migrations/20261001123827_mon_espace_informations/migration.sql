-- CreateEnum
CREATE TYPE "SituationFamiliale" AS ENUM ('celibataire', 'marie', 'divorce', 'veuf');

-- AlterTable
ALTER TABLE "dossiers_personnel" ADD COLUMN     "adresse" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "email_perso" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "enfants_a_charge" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paiement_demande_coordonnees" TEXT,
ADD COLUMN     "paiement_demande_le" TIMESTAMP(3),
ADD COLUMN     "paiement_demande_mode" "ModePaiementSalaire",
ADD COLUMN     "situation_familiale" "SituationFamiliale",
ADD COLUMN     "telephone_urgence" TEXT NOT NULL DEFAULT '';

