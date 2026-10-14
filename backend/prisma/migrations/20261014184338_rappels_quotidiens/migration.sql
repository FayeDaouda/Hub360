-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'rappel_offre';
ALTER TYPE "NotificationType" ADD VALUE 'rappel_facture';
ALTER TYPE "NotificationType" ADD VALUE 'rappel_tache';

-- CreateTable
CREATE TABLE "rappels_envoyes" (
    "cle" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rappels_envoyes_pkey" PRIMARY KEY ("cle")
);

