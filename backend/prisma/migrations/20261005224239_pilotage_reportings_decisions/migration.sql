-- CreateEnum
CREATE TYPE "TypeReporting" AS ENUM ('direction', 'rh');

-- CreateEnum
CREATE TYPE "OrigineDecision" AS ENUM ('saisie', 'hub');

-- CreateTable
CREATE TABLE "reportings_mensuels" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "type" "TypeReporting" NOT NULL,
    "mois" TEXT NOT NULL,
    "depose_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "depose_par_id" TEXT,
    "contenu" JSONB,

    CONSTRAINT "reportings_mensuels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions_registre" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "origine" "OrigineDecision" NOT NULL,
    "cle_origine" TEXT,
    "texte" TEXT NOT NULL,
    "responsable" TEXT NOT NULL,
    "responsable_role" TEXT,
    "responsable_collaborateur_id" TEXT,
    "echeance" TEXT,
    "close_le" TIMESTAMP(3),
    "close_par_id" TEXT,
    "cree_par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_registre_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reportings_mensuels_societe_id_type_mois_key" ON "reportings_mensuels"("societe_id", "type", "mois");

-- CreateIndex
CREATE UNIQUE INDEX "decisions_registre_societe_id_numero_key" ON "decisions_registre"("societe_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "decisions_registre_societe_id_cle_origine_key" ON "decisions_registre"("societe_id", "cle_origine");

-- AddForeignKey
ALTER TABLE "reportings_mensuels" ADD CONSTRAINT "reportings_mensuels_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions_registre" ADD CONSTRAINT "decisions_registre_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

