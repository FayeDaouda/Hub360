-- AlterTable
ALTER TABLE "devis" ADD COLUMN     "code_dossier" TEXT,
ADD COLUMN     "rang_dossier" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "devis_societe_id_code_dossier_rang_dossier_key" ON "devis"("societe_id", "code_dossier", "rang_dossier");


-- Reprise : les offres de dossier existantes reçoivent « CODE-OFn », rang dans
-- l'ordre de création.
WITH cibles AS (
  SELECT v.id, d.code,
         ROW_NUMBER() OVER (PARTITION BY v.societe_id, d.code ORDER BY v.cree_le, v.id) AS rang
  FROM "devis" v JOIN "dossiers_crm" d ON d.id = v.dossier_crm_id
)
UPDATE "devis" v SET code_dossier = c.code, rang_dossier = c.rang FROM cibles c WHERE c.id = v.id;
