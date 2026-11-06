-- Matrice des droits par étape (décision du 31/10/2026) : quatre droits
-- indépendants (Lecture, Écriture, Validation, Suppression) par rôle et par
-- étape d'un module, au lieu d'un niveau en échelle par module.
--
-- Reprise à l'identique : chaque module devient une étape « Ensemble du
-- module » (même clé), et chaque niveau se convertit en droits :
--   lecture    → Lecture
--   ecriture   → Lecture, Écriture, Suppression (l'écriture couvrait la suppression)
--   validation → les quatre
--   aucun      → aucun droit
-- Les lots suivants découpent chaque module en étapes plus fines.

ALTER TYPE "NotificationType" ADD VALUE 'own_rights_changed';

ALTER TABLE "journal_droits" ADD COLUMN "droits_apres" TEXT,
ADD COLUMN "droits_avant" TEXT,
ALTER COLUMN "apres" DROP NOT NULL;

CREATE TABLE "etapes_module" (
    "id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "libelles" JSONB NOT NULL,

    CONSTRAINT "etapes_module_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "droits_roles" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "etape_id" TEXT NOT NULL,
    "lecture" BOOLEAN NOT NULL DEFAULT false,
    "ecriture" BOOLEAN NOT NULL DEFAULT false,
    "validation" BOOLEAN NOT NULL DEFAULT false,
    "suppression" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "droits_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "avis_droits" (
    "id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compris_le" TIMESTAMP(3),

    CONSTRAINT "avis_droits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "etapes_module_cle_key" ON "etapes_module"("cle");
CREATE INDEX "etapes_module_module_id_idx" ON "etapes_module"("module_id");
CREATE UNIQUE INDEX "droits_roles_role_id_etape_id_key" ON "droits_roles"("role_id", "etape_id");
CREATE INDEX "avis_droits_utilisateur_id_compris_le_idx" ON "avis_droits"("utilisateur_id", "compris_le");

ALTER TABLE "etapes_module" ADD CONSTRAINT "etapes_module_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "droits_roles" ADD CONSTRAINT "droits_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "droits_roles" ADD CONSTRAINT "droits_roles_etape_id_fkey" FOREIGN KEY ("etape_id") REFERENCES "etapes_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "avis_droits" ADD CONSTRAINT "avis_droits_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Une étape par module, même clé, phrases générales.
INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", m."cle", 'Ensemble du module', 0,
  jsonb_build_object(
    'lecture', 'Voit les écrans et les informations du module',
    'ecriture', 'Crée et modifie',
    'validation', 'Valide, émet, paie, signe : les actes qui engagent',
    'suppression', 'Supprime ou archive, de façon récupérable'
  )
FROM "modules" m;

-- Les niveaux existants, convertis.
INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, rp."role_id", e."id",
  rp."niveau" <> 'aucun',
  rp."niveau" IN ('ecriture', 'validation'),
  rp."niveau" = 'validation',
  rp."niveau" IN ('ecriture', 'validation')
FROM "role_permissions" rp
JOIN "etapes_module" e ON e."module_id" = rp."module_id";

ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_module_id_fkey";
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_role_id_fkey";
DROP TABLE "role_permissions";

-- Carte blanche du CIO (31/10/2026) : ses droits ne passent plus par la
-- validation du CEO ; les demandes encore ouvertes sont closes, tracées.
UPDATE "demandes_droit"
SET "statut" = 'refusee',
    "decide_le" = CURRENT_TIMESTAMP,
    "motif" = 'Demande close le 31/10/2026 : le CIO a désormais carte blanche, ses droits ne passent plus par le CEO.'
WHERE "statut" = 'en_attente';
