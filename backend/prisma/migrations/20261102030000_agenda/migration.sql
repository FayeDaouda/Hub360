-- Agenda (lot 11, décision du 01/11/2026) : rendez-vous et réunions ; les
-- échéances des tâches et les congés validés s'y ajoutent à la lecture.
-- Nouveau module de la matrice, trois étapes. Droits de départ : chacun voit
-- et gère son agenda et organise des réunions ; l'agenda des autres n'est
-- ouvert à personne (le CIO par sa carte blanche).


ALTER TYPE "NotificationType" ADD VALUE 'rdv_invitation';
ALTER TYPE "NotificationType" ADD VALUE 'rdv_annule';

-- CreateTable
CREATE TABLE "rendez_vous" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "debut" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "lieu" TEXT,
    "description" TEXT,
    "organisateur_id" TEXT NOT NULL,
    "annule_le" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rendez_vous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites_rendez_vous" (
    "rendez_vous_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,

    CONSTRAINT "invites_rendez_vous_pkey" PRIMARY KEY ("rendez_vous_id","utilisateur_id")
);

-- CreateIndex
CREATE INDEX "rendez_vous_societe_id_debut_idx" ON "rendez_vous"("societe_id", "debut");

-- CreateIndex
CREATE INDEX "invites_rendez_vous_utilisateur_id_idx" ON "invites_rendez_vous"("utilisateur_id");

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites_rendez_vous" ADD CONSTRAINT "invites_rendez_vous_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "rendez_vous"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "modules" ("id", "nom", "cle", "description")
VALUES (gen_random_uuid()::text, 'Agenda', 'agenda', 'Rendez-vous, réunions, échéances et congés');

INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", v.cle, v.nom, v.ordre, v.libelles::jsonb
FROM "modules" m
CROSS JOIN (VALUES
  ('agenda', 'Mon agenda', 0, '{"lecture": "Voit son agenda : rendez-vous, réunions, échéances de ses tâches, congés validés", "ecriture": "Crée un rendez-vous", "suppression": "Annule un rendez-vous qu’il organise"}'),
  ('agenda.reunions', 'Réunions', 1, '{"ecriture": "Organise une réunion et y invite des collègues"}'),
  ('agenda.autres', 'Agenda des autres', 2, '{"lecture": "Voit l’agenda d’un collègue"}')
) AS v(cle, nom, ordre, libelles)
WHERE m."cle" = 'agenda';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, r."id", e."id",
  e."cle" = 'agenda', true, false, e."cle" = 'agenda'
FROM "roles" r
JOIN "etapes_module" e ON e."cle" IN ('agenda', 'agenda.reunions')
WHERE r."supprime_le" IS NULL
  AND r."nom" NOT IN ('holding_admin', 'collaborateur', 'Administrateur HUB (transverse)');
