-- AlterTable
ALTER TABLE "dossiers_personnel" ADD COLUMN     "confirme_le" TEXT,
ADD COLUMN     "confirme_par_id" TEXT;

-- CreateTable
CREATE TABLE "points_integration" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "jalon" INTEGER NOT NULL,
    "realise_le" TEXT NOT NULL,
    "compte_rendu" TEXT NOT NULL,
    "enregistre_par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "points_integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "points_integration_dossier_id_jalon_key" ON "points_integration"("dossier_id", "jalon");

-- AddForeignKey
ALTER TABLE "points_integration" ADD CONSTRAINT "points_integration_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

