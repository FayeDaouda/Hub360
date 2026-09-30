-- CreateTable
CREATE TABLE "gabarit_versions" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "libelle" TEXT NOT NULL,
    "contenu" JSONB NOT NULL,
    "motif" TEXT NOT NULL DEFAULT '',
    "cree_par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gabarit_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglages_societe" (
    "societe_id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "valeur" JSONB NOT NULL,
    "maj_par_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reglages_societe_pkey" PRIMARY KEY ("societe_id","cle")
);

-- CreateTable
CREATE TABLE "journal_reglages" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "lot" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "avant" JSONB,
    "apres" JSONB,
    "motif" TEXT NOT NULL,
    "par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_reglages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gabarit_versions_societe_id_code_numero_key" ON "gabarit_versions"("societe_id", "code", "numero");

-- CreateIndex
CREATE INDEX "journal_reglages_societe_id_created_at_idx" ON "journal_reglages"("societe_id", "created_at");

-- AddForeignKey
ALTER TABLE "gabarit_versions" ADD CONSTRAINT "gabarit_versions_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglages_societe" ADD CONSTRAINT "reglages_societe_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_reglages" ADD CONSTRAINT "journal_reglages_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

