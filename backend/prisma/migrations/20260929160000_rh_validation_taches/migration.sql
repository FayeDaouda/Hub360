-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'tache_remise';
ALTER TYPE "NotificationType" ADD VALUE 'tache_validee';
ALTER TYPE "NotificationType" ADD VALUE 'tache_renvoyee';

-- CreateTable
CREATE TABLE "validations_taches" (
    "section" "SectionTache" NOT NULL,
    "projet_id" TEXT NOT NULL,
    "groupe" TEXT NOT NULL,
    "remis_le" TIMESTAMP(3),
    "remis_par_id" TEXT,
    "valide_le" TIMESTAMP(3),
    "valide_par_id" TEXT,
    "renvoye_le" TIMESTAMP(3),
    "renvoi_motif" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "validations_taches_pkey" PRIMARY KEY ("section","projet_id","groupe")
);

-- CreateIndex
CREATE INDEX "validations_taches_remis_le_valide_le_idx" ON "validations_taches"("remis_le", "valide_le");

-- AddForeignKey
ALTER TABLE "validations_taches" ADD CONSTRAINT "validations_taches_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

