-- CreateEnum
CREATE TYPE "ModeContrat" AS ENUM ('modele', 'sur_mesure');

-- CreateEnum
CREATE TYPE "StatutContrat" AS ENUM ('brouillon', 'envoye', 'signe');

-- CreateEnum
CREATE TYPE "ModeSignatureContrat" AS ENUM ('bouton', 'trace', 'papier');

-- CreateEnum
CREATE TYPE "StatutAnnexeContrat" AS ENUM ('a_joindre', 'jointe', 'non_necessaire');

-- AlterTable
ALTER TABLE "societes" ADD COLUMN     "contrat_modele" TEXT,
ADD COLUMN     "contrat_seuil_sur_mesure_ht" DECIMAL(14,0),
ADD COLUMN     "contrat_signataire_fonction" TEXT,
ADD COLUMN     "contrat_signataire_nom" TEXT;

-- CreateTable
CREATE TABLE "annexes_contrat_gabarit" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "automatique" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "supprime_le" TIMESTAMP(3),

    CONSTRAINT "annexes_contrat_gabarit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrats" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "dossier_crm_id" TEXT NOT NULL,
    "devis_id" TEXT NOT NULL,
    "mode" "ModeContrat" NOT NULL,
    "statut" "StatutContrat" NOT NULL DEFAULT 'brouillon',
    "contenu" TEXT,
    "montant_offre_ht" DECIMAL(14,0) NOT NULL,
    "signataire_nom" TEXT NOT NULL,
    "signataire_fonction" TEXT NOT NULL,
    "document_nom" TEXT,
    "document_url" TEXT,
    "token_public_hash" TEXT,
    "date_envoi" TIMESTAMP(3),
    "signe_le" TIMESTAMP(3),
    "mode_signature" "ModeSignatureContrat",
    "signe_par_nom" TEXT,
    "signature_trace" TEXT,
    "signe_ip" TEXT,
    "scan_nom" TEXT,
    "scan_url" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annexes_contrat" (
    "id" TEXT NOT NULL,
    "contrat_id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "automatique" TEXT,
    "statut" "StatutAnnexeContrat" NOT NULL DEFAULT 'a_joindre',
    "fichier_nom" TEXT,
    "fichier_url" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "annexes_contrat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "annexes_contrat_gabarit_societe_id_idx" ON "annexes_contrat_gabarit"("societe_id");

-- CreateIndex
CREATE UNIQUE INDEX "contrats_dossier_crm_id_key" ON "contrats"("dossier_crm_id");

-- CreateIndex
CREATE UNIQUE INDEX "contrats_token_public_hash_key" ON "contrats"("token_public_hash");

-- CreateIndex
CREATE INDEX "annexes_contrat_contrat_id_idx" ON "annexes_contrat"("contrat_id");

-- AddForeignKey
ALTER TABLE "annexes_contrat_gabarit" ADD CONSTRAINT "annexes_contrat_gabarit_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrats" ADD CONSTRAINT "contrats_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrats" ADD CONSTRAINT "contrats_dossier_crm_id_fkey" FOREIGN KEY ("dossier_crm_id") REFERENCES "dossiers_crm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrats" ADD CONSTRAINT "contrats_devis_id_fkey" FOREIGN KEY ("devis_id") REFERENCES "devis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annexes_contrat" ADD CONSTRAINT "annexes_contrat_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrats"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Données de départ Grey Concrete (cadrage G validé le 27/09/2026) : annexes
-- « offre acceptée » (jointe d'office), « planning », « plans du terrain » ;
-- seuil sur mesure 50 000 000 F HT (offre complète — manuel de procédures,
-- à confirmer par la direction, modifiable dans Paramètres). Modèle de
-- contrat et signataire : VIDES, à fournir par la société (aucun texte
-- juridique inventé). Sans effet si la société n'existe pas (base neuve : seed).
UPDATE "societes" SET "contrat_seuil_sur_mesure_ht" = 50000000 WHERE "slug" = 'grey-concrete';
INSERT INTO "annexes_contrat_gabarit" ("id", "societe_id", "libelle", "automatique", "ordre")
SELECT gen_random_uuid()::text, s."id", a.libelle, a.automatique, a.ordre
FROM "societes" s
CROSS JOIN (VALUES ('Offre acceptée', 'offre', 0), ('Planning', NULL, 1), ('Plans du terrain', NULL, 2))
  AS a(libelle, automatique, ordre)
WHERE s."slug" = 'grey-concrete';
