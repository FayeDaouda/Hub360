-- Recrutement côté RH (01/11/2026) : deux chemins — embauche directe (le
-- dossier du personnel s'ouvre tout de suite, l'embauche reste tracée dans
-- Recrutement) ou circuit complet ; l'entretien planifié devient un
-- rendez-vous de l'Agenda ; chaque étape prévient qui doit suivre ; la RH voit
-- les recrutements de toutes les sociétés. Deux étapes de plus dans la matrice.

ALTER TYPE "NotificationType" ADD VALUE 'poste_ouvert';
ALTER TYPE "NotificationType" ADD VALUE 'entretien_planifie';
ALTER TYPE "NotificationType" ADD VALUE 'candidat_decide';

-- Poste créé par une embauche directe (pourvu d'emblée, sans candidature à trier).
ALTER TABLE "postes_recrutement" ADD COLUMN "direct" BOOLEAN NOT NULL DEFAULT false;

-- Entretien : le rendez-vous de l'Agenda (date, heure, lieu, invités).
ALTER TABLE "candidatures" ADD COLUMN "rendez_vous_id" TEXT;

INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", v.cle, v.nom, v.ordre, v.libelles::jsonb
FROM "modules" m
CROSS JOIN (VALUES
  ('recrutement.direct', 'Embauche directe', 3, '{"ecriture": "Embauche sans passer par le circuit : le dossier du personnel s’ouvre tout de suite, l’embauche reste tracée dans Recrutement"}'),
  ('recrutement.groupe', 'Recrutements du groupe', 4, '{"lecture": "Voit les recrutements de toutes les sociétés du groupe (postes, candidats, étapes)"}')
) AS v(cle, nom, ordre, libelles)
WHERE m."cle" = 'recrutement';

-- Droits de départ, tirés de ce qui existe : l'embauche directe à qui crée
-- déjà un dossier du personnel à la main (Écriture de « rh ») ; la vue
-- groupe à la RH.
INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, d."role_id", e."id", true, true, false, false
FROM "droits_roles" d
JOIN "etapes_module" src ON src."id" = d."etape_id" AND src."cle" = 'rh'
JOIN "roles" r ON r."id" = d."role_id" AND r."supprime_le" IS NULL
JOIN "etapes_module" e ON e."cle" = 'recrutement.direct'
WHERE d."ecriture";

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, r."id", e."id", true, false, false, false
FROM "roles" r
JOIN "etapes_module" e ON e."cle" = 'recrutement.groupe'
WHERE r."supprime_le" IS NULL AND r."nom" = 'RH';
