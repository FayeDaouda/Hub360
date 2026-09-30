-- AlterTable
ALTER TABLE "devis" ADD COLUMN     "parts_factures" JSONB;


-- Reprise : les offres déjà soumises à la DAF avant ce réglage gardent les
-- parts alors appliquées en dur (CGV Grey Concrete 2026, art. 7 : 40 / 40 / 20).
-- Soumise = sortie du brouillon (envoyée, acceptée, refusée, transformée), ou
-- brouillon d'un dossier en attente de validation par la DAF.
UPDATE "devis" d
SET "parts_factures" = '{"F1": 40, "F2": 40, "F3": 20}'::jsonb
WHERE d."statut" <> 'brouillon'
   OR EXISTS (
     SELECT 1 FROM "dossiers_crm" c
     WHERE c."id" = d."dossier_crm_id" AND c."statut" = 'en_validation'
   );
