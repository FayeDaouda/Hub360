-- Retrait des sections NICAD, Dépôt & instruction (workflow intermédiaire),
-- Journal et Certificat de conformité — les 3 blocs de la checklist couvrent
-- déjà le travail réel ; seul le statut final (obtenu/refusé) garde une
-- valeur propre (cf. mémoire du 2026-09-17).
ALTER TABLE "permis" DROP COLUMN "nicad";
ALTER TABLE "permis" DROP COLUMN "nicad_numero";
ALTER TABLE "permis" DROP COLUMN "plan_bornage";
ALTER TABLE "permis" DROP COLUMN "voie";
ALTER TABLE "permis" DROP COLUMN "date_depot";
ALTER TABLE "permis" DROP COLUMN "numero_recepisse";
ALTER TABLE "permis" DROP COLUMN "certificat_conformite";
ALTER TABLE "permis" DROP COLUMN "date_certificat";

DROP TYPE "StatutNicad";
DROP TYPE "VoieDepot";
