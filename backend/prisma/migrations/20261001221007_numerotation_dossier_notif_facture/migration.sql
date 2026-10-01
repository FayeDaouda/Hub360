-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'facture_a_valider';

-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "code_dossier" TEXT,
ADD COLUMN     "rang_dossier" INTEGER;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "facture_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "factures_societe_id_code_dossier_rang_dossier_key" ON "factures"("societe_id", "code_dossier", "rang_dossier");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "factures"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reprise : les factures déjà émises rattachées à un dossier (directement ou
-- par leur projet, dont le code est celui du dossier) reçoivent leur
-- référence « CODE-n », rang dans l'ordre d'émission (numéro de séquence).
WITH cibles AS (
  SELECT f.id,
         COALESCE(d.code, p.code) AS code,
         ROW_NUMBER() OVER (PARTITION BY f.societe_id, COALESCE(d.code, p.code) ORDER BY f.numero) AS rang
  FROM "factures" f
  LEFT JOIN "dossiers_crm" d ON d.id = f.dossier_crm_id
  LEFT JOIN "projets" p ON p.id = f.projet_id
  WHERE f.numero IS NOT NULL AND COALESCE(d.code, p.code) IS NOT NULL
)
UPDATE "factures" f SET code_dossier = c.code, rang_dossier = c.rang FROM cibles c WHERE c.id = f.id;
