-- Notifications du cycle CRM (tableau validé 2026-09-27) : qui est prévenu
-- aux moments où quelqu'un doit agir — soumission à la DAF, renvoi, réponse
-- du client, contrat signé. Destinataires et titres : src/crm/notifications-crm.ts.
-- dossier_crm_id = contexte cliquable (ouvre le dossier dans le CRM), SetNull
-- comme projet_id.

ALTER TYPE "NotificationType" ADD VALUE 'dossier_soumis';
ALTER TYPE "NotificationType" ADD VALUE 'dossier_renvoye';
ALTER TYPE "NotificationType" ADD VALUE 'offre_acceptee';
ALTER TYPE "NotificationType" ADD VALUE 'offre_refusee';
ALTER TYPE "NotificationType" ADD VALUE 'contrat_signe';

ALTER TABLE "notifications" ADD COLUMN "dossier_crm_id" TEXT;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dossier_crm_id_fkey" FOREIGN KEY ("dossier_crm_id") REFERENCES "dossiers_crm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
