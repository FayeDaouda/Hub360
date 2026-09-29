-- CreateEnum
CREATE TYPE "SectionTache" AS ENUM ('avant_projet', 'permis', 'execution');

-- AlterTable
ALTER TABLE "blocs_checklist_avp" ADD COLUMN     "debut" TEXT;

-- AlterTable
ALTER TABLE "blocs_execution" ADD COLUMN     "debut" TEXT;

-- AlterTable
ALTER TABLE "blocs_permis" ADD COLUMN     "debut" TEXT;

-- CreateTable
CREATE TABLE "durees_standard_taches" (
    "societe_id" TEXT NOT NULL,
    "section" "SectionTache" NOT NULL,
    "groupe" TEXT NOT NULL,
    "heures" DECIMAL(5,1) NOT NULL,
    "maj_par_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "durees_standard_taches_pkey" PRIMARY KEY ("societe_id","section","groupe")
);

-- CreateTable
CREATE TABLE "controles_feuilles_temps" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "mois" TEXT NOT NULL,
    "heures_imputees" DECIMAL(6,1) NOT NULL,
    "heures_disponibles" DECIMAL(6,1) NOT NULL,
    "jours_absence" INTEGER NOT NULL,
    "detail" JSONB NOT NULL,
    "controle_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "controle_par_id" TEXT,

    CONSTRAINT "controles_feuilles_temps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "controles_feuilles_temps_dossier_id_mois_key" ON "controles_feuilles_temps"("dossier_id", "mois");

-- AddForeignKey
ALTER TABLE "durees_standard_taches" ADD CONSTRAINT "durees_standard_taches_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles_feuilles_temps" ADD CONSTRAINT "controles_feuilles_temps_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

