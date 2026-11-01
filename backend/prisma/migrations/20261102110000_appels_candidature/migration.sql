-- Appels à candidatures (01/11/2026) : la RH publie un appel sur un poste
-- ouvert ; son lien externe (et la page Carrières de la société) permet à
-- chaque candidat de déposer ses informations, son CV et les pièces
-- demandées, sans compte. Le candidat reçoit un accusé de réception, la
-- convocation à l'entretien et la réponse finale par e-mail.

ALTER TYPE "NotificationType" ADD VALUE 'candidature_recue';

-- CreateTable
CREATE TABLE "appels_candidature" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "poste_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "presentation" TEXT NOT NULL,
    "lieu" TEXT,
    "type_contrat" TEXT,
    "date_limite" TEXT,
    "pieces" JSONB NOT NULL DEFAULT '[]',
    "questions" JSONB NOT NULL DEFAULT '[]',
    "ouvert" BOOLEAN NOT NULL DEFAULT true,
    "cree_par_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appels_candidature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pieces_candidature" (
    "id" TEXT NOT NULL,
    "candidature_id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pieces_candidature_pkey" PRIMARY KEY ("id")
);

-- Candidature : d'où elle vient, réponses aux questions de l'appel, consentement.
ALTER TABLE "candidatures" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'saisie';
ALTER TABLE "candidatures" ADD COLUMN "reponses" JSONB;
ALTER TABLE "candidatures" ADD COLUMN "consentement_le" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "appels_candidature_poste_id_key" ON "appels_candidature"("poste_id");
CREATE UNIQUE INDEX "appels_candidature_slug_key" ON "appels_candidature"("slug");
CREATE INDEX "appels_candidature_societe_id_ouvert_idx" ON "appels_candidature"("societe_id", "ouvert");
CREATE INDEX "pieces_candidature_candidature_id_idx" ON "pieces_candidature"("candidature_id");

-- AddForeignKey
ALTER TABLE "appels_candidature" ADD CONSTRAINT "appels_candidature_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appels_candidature" ADD CONSTRAINT "appels_candidature_poste_id_fkey" FOREIGN KEY ("poste_id") REFERENCES "postes_recrutement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pieces_candidature" ADD CONSTRAINT "pieces_candidature_candidature_id_fkey" FOREIGN KEY ("candidature_id") REFERENCES "candidatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Étape de la matrice : publier un appel (droits de départ = qui gère déjà
-- les candidatures).
INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", 'recrutement.appels', 'Appels à candidatures', 5,
  '{"ecriture": "Publie un appel à candidatures (lien externe, page Carrières), le modifie, le clôt ou le rouvre"}'::jsonb
FROM "modules" m
WHERE m."cle" = 'recrutement';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, d."role_id", e."id", true, true, false, false
FROM "droits_roles" d
JOIN "etapes_module" src ON src."id" = d."etape_id" AND src."cle" = 'recrutement.candidatures'
JOIN "roles" r ON r."id" = d."role_id" AND r."supprime_le" IS NULL
JOIN "etapes_module" e ON e."cle" = 'recrutement.appels'
WHERE d."ecriture";
