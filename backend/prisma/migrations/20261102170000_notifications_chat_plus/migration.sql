-- Notifications et messagerie, suite (02/11/2026) :
--  · préférences de chacun (pop-up, son, notification système par catégorie,
--    heures calmes) et abonnements aux notifications système (Web Push) ;
--    chaque notification est poussée une fois (poussee_le) ;
--  · messages : réponse à un message, modification et suppression (15 min),
--    pièces jointes, réactions ;
--  · une conversation par projet, tenue à jour automatiquement.

ALTER TYPE "TypeCanal" ADD VALUE 'projet';

ALTER TABLE "utilisateurs" ADD COLUMN "preferences_notifications" JSONB;

-- CreateTable
CREATE TABLE "abonnements_push" (
    "id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "appareil" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonnements_push_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "abonnements_push_endpoint_key" ON "abonnements_push"("endpoint");
CREATE INDEX "abonnements_push_utilisateur_id_idx" ON "abonnements_push"("utilisateur_id");
ALTER TABLE "abonnements_push" ADD CONSTRAINT "abonnements_push_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les notifications existantes ne sont pas poussées après coup.
ALTER TABLE "notifications" ADD COLUMN "poussee_le" TIMESTAMP(3);
UPDATE "notifications" SET "poussee_le" = "created_at";
CREATE INDEX "notifications_poussee_le_created_at_idx" ON "notifications"("poussee_le", "created_at");

-- Conversation d'un projet.
ALTER TABLE "canaux" ADD COLUMN "projet_id" TEXT;
CREATE UNIQUE INDEX "canaux_projet_id_key" ON "canaux"("projet_id");
ALTER TABLE "canaux" ADD CONSTRAINT "canaux_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Messages : réponse, modification, suppression.
ALTER TABLE "messages" ADD COLUMN "reponse_a_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "modifie_le" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "supprime_le" TIMESTAMP(3);
ALTER TABLE "messages" ADD CONSTRAINT "messages_reponse_a_id_fkey" FOREIGN KEY ("reponse_a_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "pieces_message" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "pieces_message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pieces_message_message_id_idx" ON "pieces_message"("message_id");
ALTER TABLE "pieces_message" ADD CONSTRAINT "pieces_message_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "reactions_message" (
    "message_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_message_pkey" PRIMARY KEY ("message_id", "utilisateur_id", "emoji")
);
ALTER TABLE "reactions_message" ADD CONSTRAINT "reactions_message_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reactions_message" ADD CONSTRAINT "reactions_message_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
