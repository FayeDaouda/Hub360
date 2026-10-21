-- AlterEnum
ALTER TYPE "ActionPaie" ADD VALUE 'cout_consulte';

-- CreateTable
CREATE TABLE "parametres_rentabilite" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "valeur" DOUBLE PRECISION,
    "date_effet" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametres_rentabilite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parametres_rentabilite_societe_id_cle_idx" ON "parametres_rentabilite"("societe_id", "cle");

-- Décision 12 (revue CFO, 21/10/2026) : le compte d'administration
-- (societe_admin) perd l'accès aux marges et à la RH. Tracé au journal des
-- droits, une ligne par société (auteur : décision de la direction, pas de compte).
INSERT INTO "journal_droits" ("id", "societe_id", "role_nom", "module", "avant", "apres", "created_at")
SELECT gen_random_uuid()::text, s."id", 'societe_admin', m."cle", rp."niveau", 'aucun', CURRENT_TIMESTAMP
FROM "role_permissions" rp
JOIN "roles" r ON r."id" = rp."role_id" AND r."nom" = 'societe_admin' AND r."societe_id" IS NULL
JOIN "modules" m ON m."id" = rp."module_id" AND m."cle" IN ('finances_marges', 'rh')
CROSS JOIN "societes" s
WHERE rp."niveau" <> 'aucun';

UPDATE "role_permissions" rp SET "niveau" = 'aucun'
FROM "roles" r, "modules" m
WHERE r."id" = rp."role_id" AND r."nom" = 'societe_admin' AND r."societe_id" IS NULL
  AND m."id" = rp."module_id" AND m."cle" IN ('finances_marges', 'rh');

