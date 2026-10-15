-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EvenementCompteType" ADD VALUE 'double_facteur_active';
ALTER TYPE "EvenementCompteType" ADD VALUE 'double_facteur_reinitialise';

-- AlterTable
ALTER TABLE "utilisateurs" ADD COLUMN     "totp_actif_le" TIMESTAMP(3),
ADD COLUMN     "totp_codes_secours" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totp_dernier_pas" INTEGER,
ADD COLUMN     "totp_secret" TEXT;

