-- Abonnement à son agenda depuis Google, Apple ou Outlook (12/11/2026) :
-- un lien secret par personne et par société, seule son empreinte est gardée.

-- CreateTable
CREATE TABLE "abonnements_agenda" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "jeton_hash" TEXT NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dernier_acces_le" TIMESTAMP(3),

    CONSTRAINT "abonnements_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "abonnements_agenda_jeton_hash_key" ON "abonnements_agenda"("jeton_hash");

-- CreateIndex
CREATE INDEX "abonnements_agenda_utilisateur_id_idx" ON "abonnements_agenda"("utilisateur_id");

-- CreateIndex
CREATE UNIQUE INDEX "abonnements_agenda_societe_id_utilisateur_id_key" ON "abonnements_agenda"("societe_id", "utilisateur_id");

-- AddForeignKey
ALTER TABLE "abonnements_agenda" ADD CONSTRAINT "abonnements_agenda_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonnements_agenda" ADD CONSTRAINT "abonnements_agenda_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

