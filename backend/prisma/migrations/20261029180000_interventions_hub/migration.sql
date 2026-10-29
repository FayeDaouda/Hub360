-- Interventions de l'Administrateur HUB (29/10/2026) : déblocages motivés,
-- au journal d'audit.
CREATE TYPE "TypeInterventionHub" AS ENUM ('onboard_sans_signature', 'ouverture_projet', 'cellules_projet', 'reouverture_dossier');

CREATE TABLE "interventions_hub" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "type" "TypeInterventionHub" NOT NULL,
    "cible" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "motif" TEXT NOT NULL,
    "par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ordre_journal" BIGINT,

    CONSTRAINT "interventions_hub_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "interventions_hub_societe_id_created_at_idx" ON "interventions_hub"("societe_id", "created_at");

ALTER TABLE "interventions_hub" ADD CONSTRAINT "interventions_hub_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ordre du journal d'audit (ADR 0002) : même séquence et même déclencheur
-- que les autres événements.
CREATE TRIGGER "interventions_hub_ordre_journal" BEFORE INSERT OR UPDATE OF "created_at" ON "interventions_hub" FOR EACH ROW EXECUTE FUNCTION "journal_numeroter"('created_at', 'ordre_journal');
