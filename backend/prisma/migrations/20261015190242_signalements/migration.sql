-- CreateEnum
CREATE TYPE "StatutSignalement" AS ENUM ('a_traiter', 'en_cours', 'corrige');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'signalement_recu';

-- CreateTable
CREATE TABLE "signalements" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "auteur_id" TEXT,
    "description" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "appareil" TEXT NOT NULL,
    "capture" TEXT,
    "statut" "StatutSignalement" NOT NULL DEFAULT 'a_traiter',
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traite_le" TIMESTAMP(3),
    "traite_par_id" TEXT,

    CONSTRAINT "signalements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signalements_societe_id_statut_idx" ON "signalements"("societe_id", "statut");

-- AddForeignKey
ALTER TABLE "signalements" ADD CONSTRAINT "signalements_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signalements" ADD CONSTRAINT "signalements_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

