-- DropIndex
DROP INDEX "lignes_unbord_projet_id_type_key";

-- AlterTable
ALTER TABLE "lignes_unbord" DROP COLUMN "type",
ADD COLUMN     "gabarit_id" TEXT NOT NULL,
ADD COLUMN     "libelle" TEXT NOT NULL;

-- DropEnum
DROP TYPE "TypeUnbord";

-- CreateTable
CREATE TABLE "lignes_unbord_gabarit" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "groupe" "GroupeUnbord" NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "supprime_le" TIMESTAMP(3),
    "supprime_par_id" TEXT,

    CONSTRAINT "lignes_unbord_gabarit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lignes_unbord_gabarit_societe_id_supprime_le_idx" ON "lignes_unbord_gabarit"("societe_id", "supprime_le");

-- CreateIndex
CREATE UNIQUE INDEX "lignes_unbord_projet_id_gabarit_id_key" ON "lignes_unbord"("projet_id", "gabarit_id");

-- AddForeignKey
ALTER TABLE "lignes_unbord_gabarit" ADD CONSTRAINT "lignes_unbord_gabarit_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_unbord_gabarit" ADD CONSTRAINT "lignes_unbord_gabarit_supprime_par_id_fkey" FOREIGN KEY ("supprime_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_unbord" ADD CONSTRAINT "lignes_unbord_gabarit_id_fkey" FOREIGN KEY ("gabarit_id") REFERENCES "lignes_unbord_gabarit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

