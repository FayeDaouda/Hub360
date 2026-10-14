-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'tache_assignee';
ALTER TYPE "NotificationType" ADD VALUE 'absence_a_decider';
ALTER TYPE "NotificationType" ADD VALUE 'absence_decidee';
ALTER TYPE "NotificationType" ADD VALUE 'remboursement_a_traiter';
ALTER TYPE "NotificationType" ADD VALUE 'remboursement_traite';
ALTER TYPE "NotificationType" ADD VALUE 'decision_assignee';
ALTER TYPE "NotificationType" ADD VALUE 'facture_emise';
ALTER TYPE "NotificationType" ADD VALUE 'facture_payee';
