-- Rendez-vous modifiable (Agenda, 12/11/2026) : la version envoyée aux
-- agendas des invités, et la notification « réunion modifiée ».

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'rdv_modifie';

-- AlterTable
ALTER TABLE "rendez_vous" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;
