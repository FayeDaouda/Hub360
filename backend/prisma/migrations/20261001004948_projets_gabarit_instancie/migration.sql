-- CreateEnum
CREATE TYPE "StatutTacheProjet" AS ENUM ('a_faire', 'a_valider', 'reprise', 'validee', 'non_necessaire');

-- AlterTable
ALTER TABLE "projets" ADD COLUMN     "gabarit_version_id" TEXT,
ADD COLUMN     "ouvert_le" TEXT;

-- CreateTable
CREATE TABLE "cartes_projet" (
    "id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "etape_numero" INTEGER NOT NULL,
    "etape_cle" TEXT NOT NULL,
    "etape_libelle" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "note" TEXT,
    "descriptif" TEXT,
    "etiquette" TEXT,
    "debut_j" INTEGER,
    "fin_j" INTEGER,
    "debut_le" TEXT,
    "fin_le" TEXT,
    "temps" JSONB,
    "client" BOOLEAN NOT NULL DEFAULT false,
    "fichiers" BOOLEAN NOT NULL DEFAULT false,
    "desactivation" TEXT,
    "ouvre_apres" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "cartes_projet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taches_projet" (
    "id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "carte_id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "descriptif" TEXT,
    "source_native" BOOLEAN NOT NULL DEFAULT false,
    "debut_j" INTEGER,
    "fin_j" INTEGER,
    "debut_le" TEXT,
    "fin_le" TEXT,
    "temps" JSONB NOT NULL,
    "heures" DECIMAL(6,1),
    "statut" "StatutTacheProjet" NOT NULL DEFAULT 'a_faire',
    "motif" TEXT,
    "assigne_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "validee_le" TIMESTAMP(3),
    "validee_par_id" TEXT,

    CONSTRAINT "taches_projet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cartes_projet_projet_id_cle_key" ON "cartes_projet"("projet_id", "cle");

-- CreateIndex
CREATE INDEX "taches_projet_projet_id_idx" ON "taches_projet"("projet_id");

-- CreateIndex
CREATE INDEX "taches_projet_assigne_id_idx" ON "taches_projet"("assigne_id");

-- CreateIndex
CREATE UNIQUE INDEX "taches_projet_carte_id_cle_key" ON "taches_projet"("carte_id", "cle");

-- AddForeignKey
ALTER TABLE "projets" ADD CONSTRAINT "projets_gabarit_version_id_fkey" FOREIGN KEY ("gabarit_version_id") REFERENCES "gabarit_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartes_projet" ADD CONSTRAINT "cartes_projet_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches_projet" ADD CONSTRAINT "taches_projet_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches_projet" ADD CONSTRAINT "taches_projet_carte_id_fkey" FOREIGN KEY ("carte_id") REFERENCES "cartes_projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches_projet" ADD CONSTRAINT "taches_projet_assigne_id_fkey" FOREIGN KEY ("assigne_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches_projet" ADD CONSTRAINT "taches_projet_validee_par_id_fkey" FOREIGN KEY ("validee_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

