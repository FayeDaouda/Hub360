-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'mention_projet';

-- CreateTable
CREATE TABLE "commentaires_projet" (
    "id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "carte_id" TEXT NOT NULL,
    "tache_id" TEXT,
    "parent_id" TEXT,
    "auteur_id" TEXT,
    "mentionne_id" TEXT,
    "texte" TEXT NOT NULL,
    "resolu_le" TIMESTAMP(3),
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commentaires_projet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commentaires_projet_carte_id_cree_le_idx" ON "commentaires_projet"("carte_id", "cree_le");

-- CreateIndex
CREATE INDEX "commentaires_projet_tache_id_cree_le_idx" ON "commentaires_projet"("tache_id", "cree_le");

-- AddForeignKey
ALTER TABLE "commentaires_projet" ADD CONSTRAINT "commentaires_projet_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commentaires_projet" ADD CONSTRAINT "commentaires_projet_carte_id_fkey" FOREIGN KEY ("carte_id") REFERENCES "cartes_projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commentaires_projet" ADD CONSTRAINT "commentaires_projet_tache_id_fkey" FOREIGN KEY ("tache_id") REFERENCES "taches_projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commentaires_projet" ADD CONSTRAINT "commentaires_projet_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "commentaires_projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commentaires_projet" ADD CONSTRAINT "commentaires_projet_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commentaires_projet" ADD CONSTRAINT "commentaires_projet_mentionne_id_fkey" FOREIGN KEY ("mentionne_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

