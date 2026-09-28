-- CreateEnum
CREATE TYPE "TypeContrat" AS ENUM ('cdi', 'cdd', 'stage');

-- CreateEnum
CREATE TYPE "ModePaiementSalaire" AS ENUM ('virement', 'wave', 'orange_money');

-- CreateEnum
CREATE TYPE "TypePieceDossier" AS ENUM ('piece_identite', 'cv', 'diplomes', 'contrat_signe', 'fiche_poste', 'rib_ou_attestation', 'certificat_residence', 'photo_identite', 'carte_ipm');

-- CreateTable
CREATE TABLE "dossiers_personnel" (
    "id" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "collaborateur_id" TEXT,
    "poste" TEXT NOT NULL DEFAULT '',
    "type_contrat" "TypeContrat" NOT NULL DEFAULT 'cdi',
    "date_entree" TEXT,
    "date_fin" TEXT,
    "salaire_base" INTEGER,
    "prenom" TEXT NOT NULL DEFAULT '',
    "nom" TEXT NOT NULL DEFAULT '',
    "date_naissance" TEXT,
    "lieu_naissance" TEXT NOT NULL DEFAULT '',
    "nationalite" TEXT NOT NULL DEFAULT 'Sénégalaise',
    "numero_piece" TEXT NOT NULL DEFAULT '',
    "telephone" TEXT NOT NULL DEFAULT '',
    "email_pro" TEXT NOT NULL DEFAULT '',
    "contact_urgence" TEXT NOT NULL DEFAULT '',
    "mode_paiement" "ModePaiementSalaire" NOT NULL DEFAULT 'virement',
    "coordonnees_paiement" TEXT NOT NULL DEFAULT '',
    "numero_ipm" TEXT NOT NULL DEFAULT '',
    "mission_resultat" TEXT NOT NULL DEFAULT '',
    "mission_livrables" TEXT NOT NULL DEFAULT '',
    "mission_kpi" TEXT NOT NULL DEFAULT '',
    "mission_signal_alerte" TEXT NOT NULL DEFAULT '',
    "archive_le" TIMESTAMP(3),
    "archive_par_id" TEXT,
    "cree_par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dossiers_personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pieces_dossier_personnel" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "type" "TypePieceDossier" NOT NULL,
    "nom" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "ajoute_par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pieces_dossier_personnel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dossiers_personnel_matricule_key" ON "dossiers_personnel"("matricule");

-- CreateIndex
CREATE UNIQUE INDEX "dossiers_personnel_collaborateur_id_key" ON "dossiers_personnel"("collaborateur_id");

-- CreateIndex
CREATE INDEX "dossiers_personnel_societe_id_idx" ON "dossiers_personnel"("societe_id");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_dossier_personnel_dossier_id_type_key" ON "pieces_dossier_personnel"("dossier_id", "type");

-- AddForeignKey
ALTER TABLE "dossiers_personnel" ADD CONSTRAINT "dossiers_personnel_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossiers_personnel" ADD CONSTRAINT "dossiers_personnel_collaborateur_id_fkey" FOREIGN KEY ("collaborateur_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces_dossier_personnel" ADD CONSTRAINT "pieces_dossier_personnel_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

