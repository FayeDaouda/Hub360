-- Messagerie (01/11/2026) : groupes de discussion (nom, membres choisis) et
-- mentions « @personne » qui préviennent la personne citée. Une notification
-- peut désormais pointer une conversation (clic → la conversation s'ouvre).

ALTER TYPE "TypeCanal" ADD VALUE 'groupe';
ALTER TYPE "NotificationType" ADD VALUE 'mention_chat';
ALTER TYPE "NotificationType" ADD VALUE 'groupe_chat';

-- Groupe : son nom et qui l'a créé (il gère les membres).
ALTER TABLE "canaux" ADD COLUMN "nom" TEXT;
ALTER TABLE "canaux" ADD COLUMN "cree_par_id" TEXT;

-- CreateTable
CREATE TABLE "membres_canal" (
    "canal_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "ajoute_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membres_canal_pkey" PRIMARY KEY ("canal_id", "utilisateur_id")
);
CREATE INDEX "membres_canal_utilisateur_id_idx" ON "membres_canal"("utilisateur_id");
ALTER TABLE "membres_canal" ADD CONSTRAINT "membres_canal_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canaux"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membres_canal" ADD CONSTRAINT "membres_canal_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Message : ligne d'information du groupe (« X a ajouté Y ») et personnes mentionnées.
ALTER TABLE "messages" ADD COLUMN "systeme" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Notification → conversation (mention, ajout à un groupe).
ALTER TABLE "notifications" ADD COLUMN "canal_id" TEXT;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canaux"("id") ON DELETE SET NULL ON UPDATE CASCADE;
