-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ecart_temps_signale';
ALTER TYPE "NotificationType" ADD VALUE 'ecart_temps_traite';

-- CreateTable
CREATE TABLE "ecarts_feuilles_temps" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "mois" TEXT NOT NULL,
    "commentaire" TEXT NOT NULL,
    "signale_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signale_par_id" TEXT,
    "reponse" TEXT,
    "traite_le" TIMESTAMP(3),
    "traite_par_id" TEXT,

    CONSTRAINT "ecarts_feuilles_temps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ecarts_feuilles_temps_dossier_id_mois_idx" ON "ecarts_feuilles_temps"("dossier_id", "mois");

-- AddForeignKey
ALTER TABLE "ecarts_feuilles_temps" ADD CONSTRAINT "ecarts_feuilles_temps_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

