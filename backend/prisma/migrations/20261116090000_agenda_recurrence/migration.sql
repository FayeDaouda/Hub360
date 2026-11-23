-- Rendez-vous récurrents (16/11/2026) : la règle de la série, la fin de sa
-- dernière occurrence, les occurrences modifiées ou annulées seules, les
-- rappels par occurrence.

-- AlterTable
ALTER TABLE "rendez_vous" ADD COLUMN     "fin_serie" TIMESTAMP(3),
ADD COLUMN     "regle" TEXT;

-- CreateTable
CREATE TABLE "exceptions_rendez_vous" (
    "id" TEXT NOT NULL,
    "rendez_vous_id" TEXT NOT NULL,
    "occurrence" TIMESTAMP(3) NOT NULL,
    "annulee" BOOLEAN NOT NULL DEFAULT false,
    "titre" TEXT,
    "debut" TIMESTAMP(3),
    "fin" TIMESTAMP(3),
    "lieu" TEXT,
    "description" TEXT,
    "lien_visio" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exceptions_rendez_vous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rappels_occurrences" (
    "rendez_vous_id" TEXT NOT NULL,
    "occurrence" TIMESTAMP(3) NOT NULL,
    "envoye_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rappels_occurrences_pkey" PRIMARY KEY ("rendez_vous_id","occurrence")
);

-- CreateIndex
CREATE UNIQUE INDEX "exceptions_rendez_vous_rendez_vous_id_occurrence_key" ON "exceptions_rendez_vous"("rendez_vous_id", "occurrence");

-- CreateIndex
CREATE INDEX "rendez_vous_societe_id_fin_serie_idx" ON "rendez_vous"("societe_id", "fin_serie");

-- AddForeignKey
ALTER TABLE "exceptions_rendez_vous" ADD CONSTRAINT "exceptions_rendez_vous_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "rendez_vous"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rappels_occurrences" ADD CONSTRAINT "rappels_occurrences_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "rendez_vous"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Les rendez-vous déjà là sont uniques : leur fin est celle de la série.
UPDATE "rendez_vous" SET "fin_serie" = "fin" WHERE "regle" IS NULL;
