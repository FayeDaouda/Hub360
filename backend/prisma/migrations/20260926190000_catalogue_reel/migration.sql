-- CreateEnum
CREATE TYPE "ModeCalculProduit" AS ENUM ('quantite', 'surface_planches', 'forfait');

-- AlterTable
ALTER TABLE "dossiers_crm" ADD COLUMN     "categorie_conception" TEXT;

-- AlterTable
ALTER TABLE "lignes_devis" ADD COLUMN     "planches" INTEGER,
ADD COLUMN     "surface_m2" INTEGER;

-- AlterTable
ALTER TABLE "produits_services" ADD COLUMN     "co_associe" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "famille" TEXT,
ADD COLUMN     "mode_calcul" "ModeCalculProduit" NOT NULL DEFAULT 'quantite',
ADD COLUMN     "prix_modifiable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unite" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "produits_services_societe_id_code_key" ON "produits_services"("societe_id", "code");

