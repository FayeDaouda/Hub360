-- AlterTable
ALTER TABLE "dossiers_personnel" ADD COLUMN     "utilisateur_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "dossiers_personnel_utilisateur_id_key" ON "dossiers_personnel"("utilisateur_id");

-- AddForeignKey
ALTER TABLE "dossiers_personnel" ADD CONSTRAINT "dossiers_personnel_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

