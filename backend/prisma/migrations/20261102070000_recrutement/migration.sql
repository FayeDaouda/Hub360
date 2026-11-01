-- Recrutement (lot 13, décision du 01/11/2026) : Poste ouvert → Candidatures
-- → Entretiens → Décision → Intégration RH. Le CEO approuve l'ouverture d'un
-- poste ; la RH et le N+1 (le Dir. GC) décident l'embauche ; saisie manuelle ;
-- une candidature refusée est effacée 12 mois après le refus. Nouveau module
-- de la matrice, trois étapes.

-- CreateEnum
CREATE TYPE "StatutPoste" AS ENUM ('a_approuver', 'ouvert', 'pourvu', 'ferme');

-- CreateEnum
CREATE TYPE "EtapeCandidature" AS ENUM ('candidature', 'entretien', 'embauche', 'refusee');

ALTER TYPE "NotificationType" ADD VALUE 'poste_a_approuver';
ALTER TYPE "NotificationType" ADD VALUE 'poste_decide';
ALTER TYPE "NotificationType" ADD VALUE 'embauche_decidee';

-- CreateTable
CREATE TABLE "postes_recrutement" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "description" TEXT,
    "cellule_id" TEXT,
    "statut" "StatutPoste" NOT NULL,
    "demande_par_id" TEXT NOT NULL,
    "approuve_par_id" TEXT,
    "approuve_le" TIMESTAMP(3),
    "motif_refus" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postes_recrutement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidatures" (
    "id" TEXT NOT NULL,
    "poste_id" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "etape" "EtapeCandidature" NOT NULL DEFAULT 'candidature',
    "decide_par_id" TEXT,
    "decide_le" TIMESTAMP(3),
    "motif" TEXT,
    "dossier_id" TEXT,
    "cree_par_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "postes_recrutement_societe_id_statut_idx" ON "postes_recrutement"("societe_id", "statut");

-- CreateIndex
CREATE INDEX "candidatures_poste_id_etape_idx" ON "candidatures"("poste_id", "etape");

-- CreateIndex
CREATE INDEX "candidatures_etape_decide_le_idx" ON "candidatures"("etape", "decide_le");

-- AddForeignKey
ALTER TABLE "postes_recrutement" ADD CONSTRAINT "postes_recrutement_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidatures" ADD CONSTRAINT "candidatures_poste_id_fkey" FOREIGN KEY ("poste_id") REFERENCES "postes_recrutement"("id") ON DELETE CASCADE ON UPDATE CASCADE;


INSERT INTO "modules" ("id", "nom", "cle", "description")
VALUES (gen_random_uuid()::text, 'Recrutement', 'recrutement', 'Postes, candidatures, entretiens, embauche');

INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", v.cle, v.nom, v.ordre, v.libelles::jsonb
FROM "modules" m
CROSS JOIN (VALUES
  ('recrutement.postes', 'Postes', 0, '{"lecture": "Voit les postes à pourvoir", "ecriture": "Demande l’ouverture d’un poste, le modifie", "validation": "Approuve ou refuse l’ouverture d’un poste", "suppression": "Ferme un poste"}'),
  ('recrutement.candidatures', 'Candidatures et entretiens', 1, '{"lecture": "Voit les candidats d’un poste", "ecriture": "Ajoute un candidat, note un entretien, le fait avancer", "suppression": "Retire une candidature"}'),
  ('recrutement.decision', 'Décision d’embauche', 2, '{"validation": "Décide l’embauche (le dossier du personnel s’ouvre) ou refuse le candidat"}')
) AS v(cle, nom, ordre, libelles)
WHERE m."cle" = 'recrutement';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, r."id", e."id", v.l, v.e, v.v, v.s
FROM "roles" r
CROSS JOIN LATERAL (VALUES
  ('recrutement.postes', r."nom" IN ('RH', 'Dir. GC', 'CEO (transverse)', 'CFO', 'societe_admin'), r."nom" IN ('RH', 'Dir. GC', 'societe_admin'), r."nom" IN ('CEO (transverse)', 'societe_admin'), r."nom" IN ('RH', 'societe_admin')),
  ('recrutement.candidatures', r."nom" IN ('RH', 'Dir. GC', 'CEO (transverse)', 'societe_admin'), r."nom" IN ('RH', 'Dir. GC', 'societe_admin'), false, r."nom" IN ('RH', 'societe_admin')),
  ('recrutement.decision', false, false, r."nom" IN ('RH', 'Dir. GC', 'societe_admin'), false)
) AS v(cle, l, e, v, s)
JOIN "etapes_module" e ON e."cle" = v.cle
WHERE r."supprime_le" IS NULL AND (v.l OR v.e OR v.v OR v.s);
