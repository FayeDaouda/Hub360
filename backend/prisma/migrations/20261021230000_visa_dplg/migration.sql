-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'visa_a_apposer';

-- AlterEnum
ALTER TYPE "TypeEvenementTache" ADD VALUE 'visa';

-- AlterTable
ALTER TABLE "taches_projet" ADD COLUMN     "visa_le" TIMESTAMP(3),
ADD COLUMN     "visa_par_id" TEXT,
ADD COLUMN     "visa_requis" BOOLEAN NOT NULL DEFAULT false;


-- Projets déjà ouverts : les tâches retenues pour le visa DPLG (plans du
-- permis, plans d'exécution, intégration et livraison) le demandent aussi.
UPDATE "taches_projet" t SET "visa_requis" = true
FROM "cartes_projet" c
WHERE c."id" = t."carte_id"
  AND ((c."cle" = 'permis_construire' AND t."cle" = 'plans_autorisation')
    OR (c."cle" = 'pe_architecture' AND t."cle" = 'pe_architecture')
    OR (c."cle" = 'tache_finale' AND t."cle" = 'integration_livraison'));
-- Déjà validées avant la règle : réputées visées à leur date de validation
-- (on ne bloque pas rétroactivement ce qui est parti).
UPDATE "taches_projet" SET "visa_le" = "validee_le", "visa_par_id" = "validee_par_id"
WHERE "visa_requis" AND "statut" = 'validee' AND "visa_le" IS NULL;
