-- AlterTable
ALTER TABLE "blocs_etude" ADD COLUMN     "carte_projet_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "blocs_etude_projet_id_carte_projet_id_key" ON "blocs_etude"("projet_id", "carte_projet_id");

-- AddForeignKey
ALTER TABLE "blocs_etude" ADD CONSTRAINT "blocs_etude_carte_projet_id_fkey" FOREIGN KEY ("carte_projet_id") REFERENCES "cartes_projet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

