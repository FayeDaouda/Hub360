-- CreateEnum
CREATE TYPE "InvitationType" AS ENUM ('invitation', 'reset');

-- CreateEnum
CREATE TYPE "EvenementCompteType" AS ENUM ('invitation_envoyee', 'compte_active', 'mdp_reinitialise', 'compte_desactive', 'compte_reactive');

-- AlterTable
ALTER TABLE "utilisateurs" ADD COLUMN     "desactive_le" TIMESTAMP(3),
ADD COLUMN     "desactive_par_id" TEXT,
ADD COLUMN     "sessions_valides_depuis" TIMESTAMP(3),
ALTER COLUMN "mot_de_passe_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "type" "InvitationType" NOT NULL,
    "email" TEXT NOT NULL,
    "utilisateur_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenements_compte" (
    "id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "type" "EvenementCompteType" NOT NULL,
    "par_id" TEXT,
    "detail" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenements_compte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_email_type_idx" ON "invitations"("email", "type");

-- CreateIndex
CREATE INDEX "evenements_compte_utilisateur_id_idx" ON "evenements_compte"("utilisateur_id");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenements_compte" ADD CONSTRAINT "evenements_compte_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
