-- AlterTable
ALTER TABLE "dossiers_crm" ADD COLUMN     "archive_le" TIMESTAMP(3),
ADD COLUMN     "archive_par_id" TEXT;

-- AddForeignKey
ALTER TABLE "dossiers_crm" ADD CONSTRAINT "dossiers_crm_archive_par_id_fkey" FOREIGN KEY ("archive_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

