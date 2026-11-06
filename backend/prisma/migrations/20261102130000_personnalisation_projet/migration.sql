-- Personnalisation d'un projet (01/11/2026) : la direction ajoute, modifie
-- ou retire des lignes d'un projet en cours sans toucher au gabarit (le
-- projet garde par défaut les lignes de sa version). Chaque changement est
-- tracé dans le journal du projet.

-- Ligne ajoutée au projet (absente de sa version du gabarit).
ALTER TABLE "taches_projet" ADD COLUMN "ajoutee_au_projet" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "modifications_projet" (
    "id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modifications_projet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "modifications_projet_projet_id_created_at_idx" ON "modifications_projet"("projet_id", "created_at");

ALTER TABLE "modifications_projet" ADD CONSTRAINT "modifications_projet_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Étape de la matrice (module Projets) : la direction au départ.
INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", 'projets.personnalisation', 'Personnalisation du projet', 8,
  '{"ecriture": "Ajoute, modifie ou retire des lignes d’un projet en cours, sans toucher au gabarit"}'::jsonb
FROM "modules" m
WHERE m."cle" = 'projets';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, r."id", e."id", true, true, false, false
FROM "roles" r
JOIN "etapes_module" e ON e."cle" = 'projets.personnalisation'
WHERE r."supprime_le" IS NULL AND r."nom" IN ('Dir. GC', 'CTO (transverse)', 'CEO (transverse)', 'societe_admin');
