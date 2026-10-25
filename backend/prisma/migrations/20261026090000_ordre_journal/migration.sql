-- Ordre d'insertion des événements du journal d'audit (revue de la PR #2) :
-- à horodatage égal, le journal suit l'ordre réel des événements. Les
-- identifiants sont des UUID aléatoires : une séquence commune à tous les
-- événements numérote chacun au moment où son horodatage est posé (insertion
-- ou mise à jour, ex. émission d'une facture), par un déclencheur — aucune
-- écriture de l'application n'a à s'en soucier.
CREATE SEQUENCE "journal_ordre_seq";

ALTER TABLE "evenements_compte" ADD COLUMN "ordre_journal" BIGINT;
ALTER TABLE "journal_droits" ADD COLUMN "ordre_journal" BIGINT;
ALTER TABLE "factures" ADD COLUMN "ordre_emission" BIGINT;
ALTER TABLE "paiements" ADD COLUMN "ordre_journal" BIGINT;
ALTER TABLE "paiements_supprimes" ADD COLUMN "ordre_journal" BIGINT;
ALTER TABLE "demandes_avoir" ADD COLUMN "ordre_demande" BIGINT;
ALTER TABLE "demandes_avoir" ADD COLUMN "ordre_decision" BIGINT;
ALTER TABLE "lectures_reporting" ADD COLUMN "ordre_journal" BIGINT;
ALTER TABLE "questions_reporting" ADD COLUMN "ordre_journal" BIGINT;
ALTER TABLE "questions_reporting" ADD COLUMN "ordre_reponse" BIGINT;
ALTER TABLE "parametres_rentabilite" ADD COLUMN "ordre_journal" BIGINT;
ALTER TABLE "numerotation_factures" ADD COLUMN "ordre_journal" BIGINT;
ALTER TABLE "profils_facturation" ADD COLUMN "ordre_journal" BIGINT;
ALTER TABLE "journal_clotures" ADD COLUMN "ordre_journal" BIGINT;
ALTER TABLE "journal_reglages" ADD COLUMN "ordre_journal" BIGINT;
ALTER TABLE "dossiers_personnel" ADD COLUMN "ordre_archivage" BIGINT;
ALTER TABLE "journal_paie" ADD COLUMN "ordre_journal" BIGINT;

-- Événements existants : numérotés dans l'ordre chronologique (à horodatage
-- égal, l'ordre n'est pas connu : table puis identifiant, de façon stable).
CREATE TEMPORARY TABLE "journal_numerotation" AS
SELECT t, c, id, row_number() OVER (ORDER BY le, t, c, id) AS n FROM (
  SELECT 'evenements_compte' AS t, 'ordre_journal' AS c, "id"::text AS id, "created_at" AS le FROM "evenements_compte" WHERE "created_at" IS NOT NULL
  UNION ALL
  SELECT 'journal_droits' AS t, 'ordre_journal' AS c, "id"::text AS id, "created_at" AS le FROM "journal_droits" WHERE "created_at" IS NOT NULL
  UNION ALL
  SELECT 'factures' AS t, 'ordre_emission' AS c, "id"::text AS id, "emise_le" AS le FROM "factures" WHERE "emise_le" IS NOT NULL
  UNION ALL
  SELECT 'paiements' AS t, 'ordre_journal' AS c, "id"::text AS id, "cree_le" AS le FROM "paiements" WHERE "cree_le" IS NOT NULL
  UNION ALL
  SELECT 'paiements_supprimes' AS t, 'ordre_journal' AS c, "id"::text AS id, "supprime_le" AS le FROM "paiements_supprimes" WHERE "supprime_le" IS NOT NULL
  UNION ALL
  SELECT 'demandes_avoir' AS t, 'ordre_demande' AS c, "id"::text AS id, "demande_le" AS le FROM "demandes_avoir" WHERE "demande_le" IS NOT NULL
  UNION ALL
  SELECT 'demandes_avoir' AS t, 'ordre_decision' AS c, "id"::text AS id, "decide_le" AS le FROM "demandes_avoir" WHERE "decide_le" IS NOT NULL
  UNION ALL
  SELECT 'lectures_reporting' AS t, 'ordre_journal' AS c, "id"::text AS id, "lu_le" AS le FROM "lectures_reporting" WHERE "lu_le" IS NOT NULL
  UNION ALL
  SELECT 'questions_reporting' AS t, 'ordre_journal' AS c, "id"::text AS id, "cree_le" AS le FROM "questions_reporting" WHERE "cree_le" IS NOT NULL
  UNION ALL
  SELECT 'questions_reporting' AS t, 'ordre_reponse' AS c, "id"::text AS id, "repondu_le" AS le FROM "questions_reporting" WHERE "repondu_le" IS NOT NULL
  UNION ALL
  SELECT 'parametres_rentabilite' AS t, 'ordre_journal' AS c, "id"::text AS id, "created_at" AS le FROM "parametres_rentabilite" WHERE "created_at" IS NOT NULL
  UNION ALL
  SELECT 'numerotation_factures' AS t, 'ordre_journal' AS c, "id"::text AS id, "created_at" AS le FROM "numerotation_factures" WHERE "created_at" IS NOT NULL
  UNION ALL
  SELECT 'profils_facturation' AS t, 'ordre_journal' AS c, "id"::text AS id, "created_at" AS le FROM "profils_facturation" WHERE "created_at" IS NOT NULL
  UNION ALL
  SELECT 'journal_clotures' AS t, 'ordre_journal' AS c, "id"::text AS id, "created_at" AS le FROM "journal_clotures" WHERE "created_at" IS NOT NULL
  UNION ALL
  SELECT 'journal_reglages' AS t, 'ordre_journal' AS c, "id"::text AS id, "created_at" AS le FROM "journal_reglages" WHERE "created_at" IS NOT NULL
  UNION ALL
  SELECT 'dossiers_personnel' AS t, 'ordre_archivage' AS c, "id"::text AS id, "archive_le" AS le FROM "dossiers_personnel" WHERE "archive_le" IS NOT NULL
  UNION ALL
  SELECT 'journal_paie' AS t, 'ordre_journal' AS c, "id"::text AS id, "created_at" AS le FROM "journal_paie" WHERE "created_at" IS NOT NULL
) AS evenements;

UPDATE "evenements_compte" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'evenements_compte' AND j.c = 'ordre_journal' AND j.id = "evenements_compte"."id"::text;
UPDATE "journal_droits" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'journal_droits' AND j.c = 'ordre_journal' AND j.id = "journal_droits"."id"::text;
UPDATE "factures" SET "ordre_emission" = j.n FROM "journal_numerotation" j WHERE j.t = 'factures' AND j.c = 'ordre_emission' AND j.id = "factures"."id"::text;
UPDATE "paiements" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'paiements' AND j.c = 'ordre_journal' AND j.id = "paiements"."id"::text;
UPDATE "paiements_supprimes" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'paiements_supprimes' AND j.c = 'ordre_journal' AND j.id = "paiements_supprimes"."id"::text;
UPDATE "demandes_avoir" SET "ordre_demande" = j.n FROM "journal_numerotation" j WHERE j.t = 'demandes_avoir' AND j.c = 'ordre_demande' AND j.id = "demandes_avoir"."id"::text;
UPDATE "demandes_avoir" SET "ordre_decision" = j.n FROM "journal_numerotation" j WHERE j.t = 'demandes_avoir' AND j.c = 'ordre_decision' AND j.id = "demandes_avoir"."id"::text;
UPDATE "lectures_reporting" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'lectures_reporting' AND j.c = 'ordre_journal' AND j.id = "lectures_reporting"."id"::text;
UPDATE "questions_reporting" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'questions_reporting' AND j.c = 'ordre_journal' AND j.id = "questions_reporting"."id"::text;
UPDATE "questions_reporting" SET "ordre_reponse" = j.n FROM "journal_numerotation" j WHERE j.t = 'questions_reporting' AND j.c = 'ordre_reponse' AND j.id = "questions_reporting"."id"::text;
UPDATE "parametres_rentabilite" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'parametres_rentabilite' AND j.c = 'ordre_journal' AND j.id = "parametres_rentabilite"."id"::text;
UPDATE "numerotation_factures" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'numerotation_factures' AND j.c = 'ordre_journal' AND j.id = "numerotation_factures"."id"::text;
UPDATE "profils_facturation" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'profils_facturation' AND j.c = 'ordre_journal' AND j.id = "profils_facturation"."id"::text;
UPDATE "journal_clotures" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'journal_clotures' AND j.c = 'ordre_journal' AND j.id = "journal_clotures"."id"::text;
UPDATE "journal_reglages" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'journal_reglages' AND j.c = 'ordre_journal' AND j.id = "journal_reglages"."id"::text;
UPDATE "dossiers_personnel" SET "ordre_archivage" = j.n FROM "journal_numerotation" j WHERE j.t = 'dossiers_personnel' AND j.c = 'ordre_archivage' AND j.id = "dossiers_personnel"."id"::text;
UPDATE "journal_paie" SET "ordre_journal" = j.n FROM "journal_numerotation" j WHERE j.t = 'journal_paie' AND j.c = 'ordre_journal' AND j.id = "journal_paie"."id"::text;
SELECT setval('journal_ordre_seq', COALESCE((SELECT max(n) FROM "journal_numerotation"), 0) + 1, false);
DROP TABLE "journal_numerotation";

-- Numérote l'événement quand son horodatage est posé ou change.
-- Arguments : colonne d'horodatage, colonne d'ordre.
CREATE FUNCTION "journal_numeroter"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) ->> TG_ARGV[0]) IS NOT NULL
     AND (TG_OP = 'INSERT' OR (to_jsonb(OLD) ->> TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(NEW) ->> TG_ARGV[0])) THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[1], nextval('journal_ordre_seq')));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "evenements_compte_ordre_journal" BEFORE INSERT OR UPDATE OF "created_at" ON "evenements_compte" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('created_at', 'ordre_journal');
CREATE TRIGGER "journal_droits_ordre_journal" BEFORE INSERT OR UPDATE OF "created_at" ON "journal_droits" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('created_at', 'ordre_journal');
CREATE TRIGGER "factures_ordre_emission" BEFORE INSERT OR UPDATE OF "emise_le" ON "factures" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('emise_le', 'ordre_emission');
CREATE TRIGGER "paiements_ordre_journal" BEFORE INSERT OR UPDATE OF "cree_le" ON "paiements" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('cree_le', 'ordre_journal');
CREATE TRIGGER "paiements_supprimes_ordre_journal" BEFORE INSERT OR UPDATE OF "supprime_le" ON "paiements_supprimes" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('supprime_le', 'ordre_journal');
CREATE TRIGGER "demandes_avoir_ordre_demande" BEFORE INSERT OR UPDATE OF "demande_le" ON "demandes_avoir" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('demande_le', 'ordre_demande');
CREATE TRIGGER "demandes_avoir_ordre_decision" BEFORE INSERT OR UPDATE OF "decide_le" ON "demandes_avoir" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('decide_le', 'ordre_decision');
CREATE TRIGGER "lectures_reporting_ordre_journal" BEFORE INSERT OR UPDATE OF "lu_le" ON "lectures_reporting" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('lu_le', 'ordre_journal');
CREATE TRIGGER "questions_reporting_ordre_journal" BEFORE INSERT OR UPDATE OF "cree_le" ON "questions_reporting" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('cree_le', 'ordre_journal');
CREATE TRIGGER "questions_reporting_ordre_reponse" BEFORE INSERT OR UPDATE OF "repondu_le" ON "questions_reporting" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('repondu_le', 'ordre_reponse');
CREATE TRIGGER "parametres_rentabilite_ordre_journal" BEFORE INSERT OR UPDATE OF "created_at" ON "parametres_rentabilite" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('created_at', 'ordre_journal');
CREATE TRIGGER "numerotation_factures_ordre_journal" BEFORE INSERT OR UPDATE OF "created_at" ON "numerotation_factures" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('created_at', 'ordre_journal');
CREATE TRIGGER "profils_facturation_ordre_journal" BEFORE INSERT OR UPDATE OF "created_at" ON "profils_facturation" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('created_at', 'ordre_journal');
CREATE TRIGGER "journal_clotures_ordre_journal" BEFORE INSERT OR UPDATE OF "created_at" ON "journal_clotures" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('created_at', 'ordre_journal');
CREATE TRIGGER "journal_reglages_ordre_journal" BEFORE INSERT OR UPDATE OF "created_at" ON "journal_reglages" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('created_at', 'ordre_journal');
CREATE TRIGGER "dossiers_personnel_ordre_archivage" BEFORE INSERT OR UPDATE OF "archive_le" ON "dossiers_personnel" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('archive_le', 'ordre_archivage');
CREATE TRIGGER "journal_paie_ordre_journal" BEFORE INSERT OR UPDATE OF "created_at" ON "journal_paie" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('created_at', 'ordre_journal');
