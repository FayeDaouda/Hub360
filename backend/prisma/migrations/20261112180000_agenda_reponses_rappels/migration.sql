-- Agenda (12/11/2026) : réponse des invités, lien visio, rappels, et les
-- notifications « réponse » et « rappel ».

-- CreateEnum
CREATE TYPE "ReponseInvitation" AS ENUM ('oui', 'non', 'peut_etre');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'rdv_reponse';
ALTER TYPE "NotificationType" ADD VALUE 'rdv_rappel';

-- AlterTable
ALTER TABLE "rendez_vous" ADD COLUMN     "lien_visio" TEXT,
ADD COLUMN     "rappel_envoye_le" TIMESTAMP(3),
ADD COLUMN     "rappel_minutes" INTEGER;

-- AlterTable
ALTER TABLE "invites_rendez_vous" ADD COLUMN     "repondu_le" TIMESTAMP(3),
ADD COLUMN     "reponse" "ReponseInvitation";

