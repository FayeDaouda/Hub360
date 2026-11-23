-- Synchronisation de l'Agenda avec Google et Apple (16/11/2026) : connexions
-- (accès chiffrés), agendas externes, événements importés, réunions écrites
-- chez Google ou Apple, connexions Google en cours (confirmées par la session).

-- CreateEnum
CREATE TYPE "FournisseurAgenda" AS ENUM ('google', 'apple');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'agenda_deconnecte';

-- CreateTable
CREATE TABLE "connexions_agenda" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "fournisseur" "FournisseurAgenda" NOT NULL,
    "compte" TEXT NOT NULL,
    "id_compte" TEXT NOT NULL,
    "acces_chiffre" TEXT NOT NULL,
    "derniere_synchro_le" TIMESTAMP(3),
    "erreur" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autorise_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synchro_depuis" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "connexions_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendas_externes" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "connexion_id" TEXT NOT NULL,
    "id_externe" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "couleur" TEXT,
    "importe" BOOLEAN NOT NULL DEFAULT false,
    "cible" BOOLEAN NOT NULL DEFAULT false,
    "proprietaire" BOOLEAN NOT NULL DEFAULT false,
    "maj_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agendas_externes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenements_externes" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "agenda_id" TEXT NOT NULL,
    "id_externe" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "lieu" TEXT,
    "debut" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "journee" BOOLEAN NOT NULL DEFAULT false,
    "maj_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenements_externes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liens_export_agenda" (
    "societe_id" TEXT NOT NULL,
    "connexion_id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "rendez_vous_id" TEXT NOT NULL,
    "occurrence" TIMESTAMP(3),
    "agenda_id" TEXT NOT NULL,
    "id_externe" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "maj_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liens_export_agenda_pkey" PRIMARY KEY ("connexion_id","cle")
);

-- CreateTable
CREATE TABLE "etats_connexion_agenda" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "etat_hash" TEXT NOT NULL,
    "verificateur" TEXT NOT NULL,
    "expire_le" TIMESTAMP(3) NOT NULL,
    "code_chiffre" TEXT,
    "ticket_hash" TEXT,

    CONSTRAINT "etats_connexion_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "connexions_agenda_societe_id_utilisateur_id_fournisseur_id__key" ON "connexions_agenda"("societe_id", "utilisateur_id", "fournisseur", "id_compte");

-- CreateIndex
CREATE UNIQUE INDEX "agendas_externes_connexion_id_id_externe_key" ON "agendas_externes"("connexion_id", "id_externe");

-- CreateIndex
CREATE INDEX "evenements_externes_societe_id_debut_idx" ON "evenements_externes"("societe_id", "debut");

-- CreateIndex
CREATE UNIQUE INDEX "evenements_externes_agenda_id_id_externe_key" ON "evenements_externes"("agenda_id", "id_externe");

-- CreateIndex
CREATE UNIQUE INDEX "etats_connexion_agenda_etat_hash_key" ON "etats_connexion_agenda"("etat_hash");

-- CreateIndex
CREATE UNIQUE INDEX "etats_connexion_agenda_ticket_hash_key" ON "etats_connexion_agenda"("ticket_hash");

-- AddForeignKey
ALTER TABLE "connexions_agenda" ADD CONSTRAINT "connexions_agenda_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connexions_agenda" ADD CONSTRAINT "connexions_agenda_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendas_externes" ADD CONSTRAINT "agendas_externes_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendas_externes" ADD CONSTRAINT "agendas_externes_connexion_id_fkey" FOREIGN KEY ("connexion_id") REFERENCES "connexions_agenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenements_externes" ADD CONSTRAINT "evenements_externes_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenements_externes" ADD CONSTRAINT "evenements_externes_agenda_id_fkey" FOREIGN KEY ("agenda_id") REFERENCES "agendas_externes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liens_export_agenda" ADD CONSTRAINT "liens_export_agenda_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liens_export_agenda" ADD CONSTRAINT "liens_export_agenda_connexion_id_fkey" FOREIGN KEY ("connexion_id") REFERENCES "connexions_agenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etats_connexion_agenda" ADD CONSTRAINT "etats_connexion_agenda_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

