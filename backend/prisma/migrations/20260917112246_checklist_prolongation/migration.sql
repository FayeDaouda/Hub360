-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'prolongation_demandee';
ALTER TYPE "NotificationType" ADD VALUE 'prolongation_decidee';

-- AlterTable
ALTER TABLE "lignes_checklist_avp" ADD COLUMN     "prolongation_demandee_le" TIMESTAMP(3),
ADD COLUMN     "prolongation_echeance" TEXT,
ADD COLUMN     "prolongation_motif" TEXT;
