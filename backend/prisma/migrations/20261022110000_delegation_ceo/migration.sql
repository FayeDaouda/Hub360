-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'delegation_ceo';

-- CreateTable
CREATE TABLE "delegations_ceo" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "delegataire_id" TEXT NOT NULL,
    "role_delegataire" TEXT NOT NULL,
    "du" TEXT NOT NULL,
    "au" TEXT NOT NULL,
    "cree_par_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoque_le" TIMESTAMP(3),
    "revoque_par_id" TEXT,

    CONSTRAINT "delegations_ceo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delegations_ceo_societe_id_au_idx" ON "delegations_ceo"("societe_id", "au");

