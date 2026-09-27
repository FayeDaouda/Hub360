-- Étape E : cycle de statuts CRM. Renommage des valeurs existantes (les
-- lignes suivent, aucune donnée perdue) + nouvelle étape « en_validation ».
--   nouveau       → nouveau_projet
--   devis_contrat → offre_envoyee
--   valide        → onboard   (même rôle : déclenche la création du projet)
--   annule        → perdu
ALTER TYPE "StatutCrm" RENAME VALUE 'nouveau' TO 'nouveau_projet';
ALTER TYPE "StatutCrm" RENAME VALUE 'devis_contrat' TO 'offre_envoyee';
ALTER TYPE "StatutCrm" RENAME VALUE 'valide' TO 'onboard';
ALTER TYPE "StatutCrm" RENAME VALUE 'annule' TO 'perdu';
ALTER TYPE "StatutCrm" ADD VALUE 'en_validation' BEFORE 'offre_envoyee';

ALTER TABLE "dossiers_crm" ALTER COLUMN "statut" SET DEFAULT 'nouveau_projet';

-- CreateTable
CREATE TABLE "dossier_crm_transitions" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "de" "StatutCrm",
    "vers" "StatutCrm" NOT NULL,
    "par_id" TEXT,
    "commentaire" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dossier_crm_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dossier_crm_transitions_dossier_id_cree_le_idx" ON "dossier_crm_transitions"("dossier_id", "cree_le");

-- AddForeignKey
ALTER TABLE "dossier_crm_transitions" ADD CONSTRAINT "dossier_crm_transitions_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers_crm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_crm_transitions" ADD CONSTRAINT "dossier_crm_transitions_par_id_fkey" FOREIGN KEY ("par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reprise : chaque dossier existant reçoit une première ligne de journal
-- (statut repris tel quel, à sa date de création). Un dossier « perdu »
-- (ex-« annulé ») n'avait pas de motif : on le dit explicitement plutôt que
-- d'en inventer un.
INSERT INTO "dossier_crm_transitions" ("id", "dossier_id", "de", "vers", "par_id", "commentaire", "cree_le")
SELECT gen_random_uuid()::text, d."id", NULL, d."statut", NULL,
       CASE WHEN d."statut" = 'perdu'
            THEN 'Motif non renseigné — ancien statut « Annulé », repris au passage au nouveau cycle.'
            ELSE 'Statut repris au passage au nouveau cycle commercial.' END,
       d."created_at"
FROM "dossiers_crm" d;
