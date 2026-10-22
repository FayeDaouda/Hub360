-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'synthese_mensuelle';

-- CreateTable
CREATE TABLE "syntheses_mensuelles" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "mois" TEXT NOT NULL,
    "contenu" JSONB NOT NULL,
    "genere_le" TIMESTAMP(3) NOT NULL,
    "commentaire" TEXT,
    "commentaire_par_id" TEXT,
    "commentaire_le" TIMESTAMP(3),

    CONSTRAINT "syntheses_mensuelles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "syntheses_mensuelles_societe_id_mois_key" ON "syntheses_mensuelles"("societe_id", "mois");

