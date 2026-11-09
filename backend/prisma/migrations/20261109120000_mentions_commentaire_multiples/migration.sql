-- Fils de projet (09/11/2026) : un commentaire peut citer plusieurs personnes
-- (« @ » propose les noms dans la saisie, comme la messagerie). La personne
-- mentionnée et son état « lue » passent du commentaire à une table, une
-- ligne par personne citée ; les mentions existantes y sont recopiées.

-- CreateTable
CREATE TABLE "mentions_commentaire_projet" (
    "commentaire_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "lue_le" TIMESTAMP(3),

    CONSTRAINT "mentions_commentaire_projet_pkey" PRIMARY KEY ("commentaire_id","utilisateur_id")
);
CREATE INDEX "mentions_commentaire_projet_utilisateur_id_idx" ON "mentions_commentaire_projet"("utilisateur_id");
ALTER TABLE "mentions_commentaire_projet" ADD CONSTRAINT "mentions_commentaire_projet_commentaire_id_fkey" FOREIGN KEY ("commentaire_id") REFERENCES "commentaires_projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentions_commentaire_projet" ADD CONSTRAINT "mentions_commentaire_projet_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recopie des mentions existantes (une par commentaire), état « lue » compris.
INSERT INTO "mentions_commentaire_projet" ("commentaire_id", "utilisateur_id", "lue_le")
SELECT "id", "mentionne_id", "mention_lue_le"
FROM "commentaires_projet"
WHERE "mentionne_id" IS NOT NULL;

-- Puis l'ancienne colonne unique disparaît.
ALTER TABLE "commentaires_projet" DROP CONSTRAINT "commentaires_projet_mentionne_id_fkey";
DROP INDEX "commentaires_projet_mentionne_id_cree_le_idx";
ALTER TABLE "commentaires_projet" DROP COLUMN "mention_lue_le",
DROP COLUMN "mentionne_id";
