-- AlterTable
ALTER TABLE "blocs_etude" ADD COLUMN     "bureau_regle_le" TIMESTAMP(3),
ADD COLUMN     "bureau_regle_par_id" TEXT;

-- CreateTable
CREATE TABLE "lignes_facture" (
    "id" TEXT NOT NULL,
    "facture_id" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "montant_ht" DECIMAL(14,0) NOT NULL,
    "montant_base" DECIMAL(14,0),
    "bloc_etude_id" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lignes_facture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lignes_facture_facture_id_idx" ON "lignes_facture"("facture_id");

-- CreateIndex
CREATE INDEX "lignes_facture_bloc_etude_id_idx" ON "lignes_facture"("bloc_etude_id");

-- AddForeignKey
ALTER TABLE "lignes_facture" ADD CONSTRAINT "lignes_facture_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_facture" ADD CONSTRAINT "lignes_facture_bloc_etude_id_fkey" FOREIGN KEY ("bloc_etude_id") REFERENCES "blocs_etude"("id") ON DELETE SET NULL ON UPDATE CASCADE;

