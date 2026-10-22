-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'rappel_decision';
ALTER TYPE "NotificationType" ADD VALUE 'decision_en_retard';

-- AlterTable
ALTER TABLE "decisions_registre" ADD COLUMN     "cellule_id" TEXT,
ADD COLUMN     "client_id" TEXT,
ADD COLUMN     "projet_id" TEXT;

-- AddForeignKey
ALTER TABLE "decisions_registre" ADD CONSTRAINT "decisions_registre_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions_registre" ADD CONSTRAINT "decisions_registre_cellule_id_fkey" FOREIGN KEY ("cellule_id") REFERENCES "cellules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions_registre" ADD CONSTRAINT "decisions_registre_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

