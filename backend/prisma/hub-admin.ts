import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { ROLE_HUB_ADMIN } from '@hub/domain';

// Compte d'Administrateur HUB (décision du 29/10/2026) : carte blanche sur
// toutes les sociétés. Ne s'attribue pas dans le HUB (écran Comptes & rôles),
// seulement ici, sur le serveur. Affectation transverse (societeId null) :
// le compte se connecte à n'importe quelle société.
//
//   HUB_ADMIN_EMAIL=… HUB_ADMIN_PRENOM=… HUB_ADMIN_NOM=… npm run hub-admin
//
// Ne touche ni au socle ni à la matrice. Rejouable : un compte existant garde
// son mot de passe et reçoit le rôle s'il ne l'a pas. Le mot de passe
// provisoire n'est affiché qu'une fois ; la double authentification est
// demandée dès la première connexion en production.

const COUT_BCRYPT = 12;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readPerson() {
  const email = process.env.HUB_ADMIN_EMAIL?.trim().toLowerCase() ?? '';
  const prenom = process.env.HUB_ADMIN_PRENOM?.trim() ?? '';
  const nom = process.env.HUB_ADMIN_NOM?.trim() ?? '';
  if (!EMAIL.test(email) || !prenom || !nom) {
    throw new Error('Renseigner HUB_ADMIN_EMAIL (adresse valide), HUB_ADMIN_PRENOM et HUB_ADMIN_NOM.');
  }
  return { email, prenom, nom };
}

async function main() {
  const person = readPerson();
  const prisma = new PrismaClient();
  try {
    const role =
      (await prisma.role.findFirst({ where: { nom: ROLE_HUB_ADMIN, societeId: null, supprimeLe: null } })) ??
      (await prisma.role.create({ data: { nom: ROLE_HUB_ADMIN } }));

    const existing = await prisma.utilisateur.findUnique({ where: { email: person.email }, select: { id: true } });
    let temporary: string | null = null;
    const account =
      existing ??
      (await (async () => {
        temporary = randomBytes(12).toString('base64url');
        return prisma.utilisateur.create({
          data: { ...person, motDePasseHash: await bcrypt.hash(temporary, COUT_BCRYPT) },
          select: { id: true },
        });
      })());

    const assigned = await prisma.utilisateurSocieteRole.findFirst({
      where: { utilisateurId: account.id, societeId: null, roleId: role.id },
    });
    if (!assigned) {
      await prisma.utilisateurSocieteRole.create({ data: { utilisateurId: account.id, roleId: role.id } });
    }

    // Une affectation dans une société passe avant la transverse (AuthService.acces) :
    // dans cette société, le compte resterait sur son autre rôle.
    const others = await prisma.utilisateurSocieteRole.count({
      where: { utilisateurId: account.id, NOT: { roleId: role.id } },
    });
    if (others) {
      console.warn(
        `  Attention : ce compte a ${others} autre(s) rôle(s). Utiliser une adresse dédiée à l’Administrateur HUB.`,
      );
    }

    const companies = await prisma.societe.findMany({ where: { actif: true }, select: { slug: true } });
    console.log(`Administrateur HUB : ${person.email}`);
    console.log(`  Connexion : ${companies.map((c) => `/login/${c.slug}`).join(', ')}`);
    console.log(
      temporary
        ? `  Mot de passe provisoire (affiché une seule fois) : ${temporary}`
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
