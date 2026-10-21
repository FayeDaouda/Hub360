-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'coordonnees_paiement_modifiees';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "ninea" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "profils_facturation" ADD COLUMN     "capital" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "centre_fiscal" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "logo_document" TEXT;

