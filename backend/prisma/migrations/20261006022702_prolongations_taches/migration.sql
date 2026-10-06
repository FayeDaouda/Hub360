-- CreateEnum
CREATE TYPE "DecisionProlongation" AS ENUM ('accordee', 'refusee');

-- AlterEnum
ALTER TYPE "TypeEvenementTache" ADD VALUE 'prolongation';

-- CreateTable
CREATE TABLE "prolongations_taches" (
    "id" TEXT NOT NULL,
    "tache_id" TEXT NOT NULL,
    "jusquau" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "demande_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "demande_par_id" TEXT,
    "decision" "DecisionProlongation",
    "decidee_le" TIMESTAMP(3),
    "decidee_par_id" TEXT,

    CONSTRAINT "prolongations_taches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prolongations_taches_tache_id_idx" ON "prolongations_taches"("tache_id");

-- AddForeignKey
ALTER TABLE "prolongations_taches" ADD CONSTRAINT "prolongations_taches_tache_id_fkey" FOREIGN KEY ("tache_id") REFERENCES "taches_projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

