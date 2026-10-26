import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { installerSocle } from './socle';

// Amorçage d'une VRAIE installation (base vide, production comprise) : le
// socle réel (rôles, matrice validée, société, catalogue, annexes) et le
// compte du CIO — aucune donnée de démonstration. Rejouable : rien n'est
// dupliqué, un compte existant garde son mot de passe.
//
//   HUB_CIO_EMAIL=… HUB_CIO_PRENOM=… HUB_CIO_NOM=… npm run demarrage
//
// Le mot de passe provisoire n'est affiché qu'une fois : le CIO le change à
// sa première connexion (menu du compte · changer mon mot de passe).

const ROLE_CIO = 'CIO (transverse)';
const COUT_BCRYPT = 12;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function lireCio() {
  const email = process.env.HUB_CIO_EMAIL?.trim().toLowerCase() ?? '';
  const prenom = process.env.HUB_CIO_PRENOM?.trim() ?? '';
  const nom = process.env.HUB_CIO_NOM?.trim() ?? '';
  if (!EMAIL.test(email) || !prenom || !nom) {
    throw new Error('Renseigner HUB_CIO_EMAIL (adresse valide), HUB_CIO_PRENOM et HUB_CIO_NOM.');
  }
  return { email, prenom, nom };
}

async function main() {
  const cio = lireCio();
  const prisma = new PrismaClient();
  try {
    const { grey } = await installerSocle(prisma);

    const role = await prisma.role.findFirst({ where: { nom: ROLE_CIO, societeId: null, supprimeLe: null } });
    if (!role) throw new Error(`Rôle « ${ROLE_CIO} » absent de la matrice.`);

    const existant = await prisma.utilisateur.findUnique({ where: { email: cio.email }, select: { id: true } });
    let provisoire: string | null = null;
    const compte =
      existant ??
      (await (async () => {
        provisoire = randomBytes(12).toString('base64url');
        return prisma.utilisateur.create({
          data: { ...cio, motDePasseHash: await bcrypt.hash(provisoire, COUT_BCRYPT) },
          select: { id: true },
        });
      })());
    const attribue = await prisma.utilisateurSocieteRole.findFirst({
      where: { utilisateurId: compte.id, societeId: grey.id, roleId: role.id },
    });
    if (!attribue) {
      await prisma.utilisateurSocieteRole.create({
        data: { utilisateurId: compte.id, societeId: grey.id, roleId: role.id },
      });
    }

    console.log('Démarrage terminé : socle réel en place (rôles, matrice, société, catalogue).');
    console.log(`  Compte CIO : ${cio.email} → /admin/${grey.slug}`);
    console.log(
      provisoire
        ? `  Mot de passe provisoire (affiché une seule fois) : ${provisoire}`
        : '  Compte déjà existant : mot de passe inchangé.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
