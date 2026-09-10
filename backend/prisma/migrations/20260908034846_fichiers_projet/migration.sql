-- CreateEnum
CREATE TYPE "TypeFichier" AS ENUM ('plan', 'rendu_source', 'devis', 'plaquette', 'pdf_dossier', 'autre');

-- CreateTable
CREATE TABLE "fichiers_projet" (
    "id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type_mime" TEXT NOT NULL DEFAULT '',
    "taille" INTEGER NOT NULL DEFAULT 0,
    "type" "TypeFichier" NOT NULL DEFAULT 'autre',
    "phase" "Phase",
    "note" TEXT NOT NULL DEFAULT '',
    "ajoute_par_id" TEXT,
    "ajoute_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supprimee" BOOLEAN NOT NULL DEFAULT false,
    "supprime_le" TIMESTAMP(3),
    "supprime_par_id" TEXT,

    CONSTRAINT "fichiers_projet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fichiers_projet_projet_id_supprimee_idx" ON "fichiers_projet"("projet_id", "supprimee");

-- AddForeignKey
ALTER TABLE "fichiers_projet" ADD CONSTRAINT "fichiers_projet_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichiers_projet" ADD CONSTRAINT "fichiers_projet_ajoute_par_id_fkey" FOREIGN KEY ("ajoute_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichiers_projet" ADD CONSTRAINT "fichiers_projet_supprime_par_id_fkey" FOREIGN KEY ("supprime_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
