-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'avenant_ts';

-- AlterTable
ALTER TABLE "taches_projet" ADD COLUMN     "devis_ts_id" TEXT;

-- AddForeignKey
ALTER TABLE "taches_projet" ADD CONSTRAINT "taches_projet_devis_ts_id_fkey" FOREIGN KEY ("devis_ts_id") REFERENCES "devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

