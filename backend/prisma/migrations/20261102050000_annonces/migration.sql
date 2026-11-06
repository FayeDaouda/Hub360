-- Annonces (lot 12, décision du 01/11/2026) : à une société, à tout le
-- groupe ou à une équipe ; « importante » = accusé de lecture et
-- notification. Validation avant publication réglable : qui a la Validation
-- de l'étape publie directement ; au départ, tous les rôles de direction
-- l'ont (pas de validation) ; le Salarié lit.

-- CreateEnum
CREATE TYPE "AudienceAnnonce" AS ENUM ('societe', 'groupe', 'equipe');

-- CreateEnum
CREATE TYPE "StatutAnnonce" AS ENUM ('a_valider', 'publiee', 'retiree');

ALTER TYPE "NotificationType" ADD VALUE 'annonce_importante';
ALTER TYPE "NotificationType" ADD VALUE 'annonce_a_valider';

-- CreateTable
CREATE TABLE "annonces" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "audience" "AudienceAnnonce" NOT NULL,
    "cellule_id" TEXT,
    "importante" BOOLEAN NOT NULL DEFAULT false,
    "statut" "StatutAnnonce" NOT NULL,
    "auteur_id" TEXT NOT NULL,
    "publiee_le" TIMESTAMP(3),
    "validee_par_id" TEXT,
    "retiree_le" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annonces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectures_annonces" (
    "annonce_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "lu_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lectures_annonces_pkey" PRIMARY KEY ("annonce_id","utilisateur_id")
);

-- CreateIndex
CREATE INDEX "annonces_societe_id_statut_publiee_le_idx" ON "annonces"("societe_id", "statut", "publiee_le");

-- CreateIndex
CREATE INDEX "annonces_audience_statut_idx" ON "annonces"("audience", "statut");

-- AddForeignKey
ALTER TABLE "annonces" ADD CONSTRAINT "annonces_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectures_annonces" ADD CONSTRAINT "lectures_annonces_annonce_id_fkey" FOREIGN KEY ("annonce_id") REFERENCES "annonces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


INSERT INTO "modules" ("id", "nom", "cle", "description")
VALUES (gen_random_uuid()::text, 'Annonces', 'annonces', 'Actualités et annonces internes');

INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", 'annonces', 'Annonces', 0,
  '{"lecture": "Lit les annonces de sa société, du groupe et de son équipe", "ecriture": "Rédige une annonce", "validation": "Publie une annonce sans validation, ou valide celle d’un autre", "suppression": "Retire une annonce publiée"}'::jsonb
FROM "modules" m WHERE m."cle" = 'annonces';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, r."id", e."id", true, d, d, d
FROM "roles" r
CROSS JOIN LATERAL (SELECT r."nom" NOT IN ('Salarié') AS d) AS x(d)
JOIN "etapes_module" e ON e."cle" = 'annonces'
WHERE r."supprime_le" IS NULL
  AND r."nom" NOT IN ('holding_admin', 'collaborateur', 'Administrateur HUB (transverse)');
