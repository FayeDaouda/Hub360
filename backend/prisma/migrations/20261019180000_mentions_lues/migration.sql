-- AlterTable
ALTER TABLE "commentaires_projet" ADD COLUMN     "mention_lue_le" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "commentaires_projet_mentionne_id_cree_le_idx" ON "commentaires_projet"("mentionne_id", "cree_le");

