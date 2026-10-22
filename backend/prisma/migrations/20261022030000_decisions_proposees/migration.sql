-- CreateEnum
CREATE TYPE "EtatProposition" AS ENUM ('proposee', 'acceptee', 'refusee');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'decision_proposee';
ALTER TYPE "NotificationType" ADD VALUE 'decision_arbitree';

-- AlterTable
ALTER TABLE "decisions_registre" ADD COLUMN     "arbitre_le" TIMESTAMP(3),
ADD COLUMN     "arbitre_par_id" TEXT,
ADD COLUMN     "motif_arbitrage" TEXT,
ADD COLUMN     "proposee_initiale" JSONB,
ADD COLUMN     "proposition" "EtatProposition";

