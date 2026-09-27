-- AlterTable
ALTER TABLE "fichiers_projet" ADD COLUMN     "item_etude_id" TEXT;

-- AlterTable
ALTER TABLE "images_projet" ADD COLUMN     "item_etude_id" TEXT;

-- CreateTable
CREATE TABLE "blocs_etude_gabarit" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "supprime_le" TIMESTAMP(3),
    "supprime_par_id" TEXT,

    CONSTRAINT "blocs_etude_gabarit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_etude_gabarit" (
    "id" TEXT NOT NULL,
    "bloc_etude_gabarit_id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "supprime_le" TIMESTAMP(3),
    "supprime_par_id" TEXT,

    CONSTRAINT "lignes_etude_gabarit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocs_etude" (
    "id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "bloc_etude_gabarit_id" TEXT,
    "libelle" TEXT NOT NULL,
    "interlocuteur" TEXT NOT NULL DEFAULT '',
    "contact_interlocuteur" TEXT NOT NULL DEFAULT '',
    "statut" "StatutEtude" NOT NULL DEFAULT 'a_lancer',
    "date_remise_prevue" TEXT,
    "date_remise_reelle" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "facture_montant" DECIMAL(14,0),
    "facture_fichier_nom" TEXT,
    "facture_fichier_cle" TEXT,
    "supprimee" BOOLEAN NOT NULL DEFAULT false,
    "supprime_le" TIMESTAMP(3),
    "supprime_par_id" TEXT,

    CONSTRAINT "blocs_etude_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_etude" (
    "id" TEXT NOT NULL,
    "bloc_etude_id" TEXT NOT NULL,
    "ligne_etude_gabarit_id" TEXT,
    "libelle" TEXT NOT NULL,
    "fait" BOOLEAN NOT NULL DEFAULT false,
    "non_requise" BOOLEAN NOT NULL DEFAULT false,
    "supprimee" BOOLEAN NOT NULL DEFAULT false,
    "supprime_le" TIMESTAMP(3),
    "supprime_par_id" TEXT,

    CONSTRAINT "items_etude_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocs_etude_gabarit_societe_id_supprime_le_idx" ON "blocs_etude_gabarit"("societe_id", "supprime_le");

-- CreateIndex
CREATE INDEX "lignes_etude_gabarit_bloc_etude_gabarit_id_supprime_le_idx" ON "lignes_etude_gabarit"("bloc_etude_gabarit_id", "supprime_le");

-- CreateIndex
CREATE UNIQUE INDEX "blocs_etude_projet_id_bloc_etude_gabarit_id_key" ON "blocs_etude"("projet_id", "bloc_etude_gabarit_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_etude_bloc_etude_id_ligne_etude_gabarit_id_key" ON "items_etude"("bloc_etude_id", "ligne_etude_gabarit_id");

-- AddForeignKey
ALTER TABLE "blocs_etude_gabarit" ADD CONSTRAINT "blocs_etude_gabarit_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocs_etude_gabarit" ADD CONSTRAINT "blocs_etude_gabarit_supprime_par_id_fkey" FOREIGN KEY ("supprime_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_etude_gabarit" ADD CONSTRAINT "lignes_etude_gabarit_bloc_etude_gabarit_id_fkey" FOREIGN KEY ("bloc_etude_gabarit_id") REFERENCES "blocs_etude_gabarit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_etude_gabarit" ADD CONSTRAINT "lignes_etude_gabarit_supprime_par_id_fkey" FOREIGN KEY ("supprime_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocs_etude" ADD CONSTRAINT "blocs_etude_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "etudes"("projet_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocs_etude" ADD CONSTRAINT "blocs_etude_bloc_etude_gabarit_id_fkey" FOREIGN KEY ("bloc_etude_gabarit_id") REFERENCES "blocs_etude_gabarit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocs_etude" ADD CONSTRAINT "blocs_etude_supprime_par_id_fkey" FOREIGN KEY ("supprime_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_etude" ADD CONSTRAINT "items_etude_bloc_etude_id_fkey" FOREIGN KEY ("bloc_etude_id") REFERENCES "blocs_etude"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_etude" ADD CONSTRAINT "items_etude_ligne_etude_gabarit_id_fkey" FOREIGN KEY ("ligne_etude_gabarit_id") REFERENCES "lignes_etude_gabarit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_etude" ADD CONSTRAINT "items_etude_supprime_par_id_fkey" FOREIGN KEY ("supprime_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images_projet" ADD CONSTRAINT "images_projet_item_etude_id_fkey" FOREIGN KEY ("item_etude_id") REFERENCES "items_etude"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichiers_projet" ADD CONSTRAINT "fichiers_projet_item_etude_id_fkey" FOREIGN KEY ("item_etude_id") REFERENCES "items_etude"("id") ON DELETE SET NULL ON UPDATE CASCADE;

