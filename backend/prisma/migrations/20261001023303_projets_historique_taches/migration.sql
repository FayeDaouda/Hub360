-- CreateEnum
CREATE TYPE "TypeEvenementTache" AS ENUM ('assignation', 'remise', 'validation', 'reprise');

-- CreateTable
CREATE TABLE "evenements_tache_projet" (
    "id" TEXT NOT NULL,
    "tache_id" TEXT NOT NULL,
    "type" "TypeEvenementTache" NOT NULL,
    "par_id" TEXT,
    "detail" TEXT NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenements_tache_projet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evenements_tache_projet_tache_id_cree_le_idx" ON "evenements_tache_projet"("tache_id", "cree_le");

-- AddForeignKey
ALTER TABLE "evenements_tache_projet" ADD CONSTRAINT "evenements_tache_projet_tache_id_fkey" FOREIGN KEY ("tache_id") REFERENCES "taches_projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenements_tache_projet" ADD CONSTRAINT "evenements_tache_projet_par_id_fkey" FOREIGN KEY ("par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

