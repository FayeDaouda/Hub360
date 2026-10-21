-- AlterTable
ALTER TABLE "taches_projet" ADD COLUMN     "visa_non_trace" BOOLEAN NOT NULL DEFAULT false;


-- Revue Dir. GC : les tâches validées avant la règle du visa n'ont pas été
-- visées — on ne l'affirme plus (elles avaient reçu visa_le = validee_le).
UPDATE "taches_projet"
SET "visa_non_trace" = true, "visa_le" = NULL, "visa_par_id" = NULL
WHERE "visa_requis" AND "statut" = 'validee' AND "visa_le" IS NOT NULL AND "visa_le" = "validee_le";
