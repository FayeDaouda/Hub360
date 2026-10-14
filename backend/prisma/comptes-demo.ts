import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { verifierEnvironnementDemo } from './garde-demo';

// Comptes fictifs de démonstration — UN par rôle de la matrice Grey Concrete
// (sept. 2026), pour montrer et recetter les droits de chaque rôle. Personnes
// inventées (aucun vrai salarié), mot de passe de démo commun. Aucun salaire :
// il se saisit dans l'écran Comptes & rôles de l'espace groupe.
//
// Utilisé par seed.ts ET exécutable seul (npm run comptes-demo) pour les
// ajouter à une base existante SANS relancer le seed (qui réinitialise les
// données de Grey Concrete). Idempotent et non destructif : un compte déjà
// présent garde son mot de passe, et son rôle n'est posé que s'il n'en a
// encore aucun dans la société — un rôle changé depuis l'écran est respecté.

export const MOT_DE_PASSE_DEMO = 'changeme123';

// IDs figés (même raison que dans seed.ts : un reseed les recrée à l'identique).
export const COMPTES_DEMO = [
  { role: 'Dir. GC', id: '00000000-0000-4000-8000-000000000004', email: 'dirgc.greyconcrete@hub.group', prenom: 'Cheikh', nom: 'Fall' },
  { role: 'COO', id: '00000000-0000-4000-8000-000000000006', email: 'coo.greyconcrete@hub.group', prenom: 'Mariama', nom: 'Seck' },
  { role: 'CFO', id: '00000000-0000-4000-8000-000000000005', email: 'cfo.greyconcrete@hub.group', prenom: 'Bineta', nom: 'Sarr' },
  { role: 'RH', id: '00000000-0000-4000-8000-000000000007', email: 'rh.greyconcrete@hub.group', prenom: 'Coumba', nom: 'Gaye' },
  { role: 'Salarié', id: '00000000-0000-4000-8000-000000000008', email: 'salarie.greyconcrete@hub.group', prenom: 'Pape', nom: 'Sy' },
  { role: 'CEO (transverse)', id: '00000000-0000-4000-8000-000000000009', email: 'ceo.greyconcrete@hub.group', prenom: 'Abdoulaye', nom: 'Mbaye' },
  { role: 'CTO (transverse)', id: '00000000-0000-4000-8000-000000000010', email: 'cto.greyconcrete@hub.group', prenom: 'Khadija', nom: 'Cissé' },
  { role: 'CIO (transverse)', id: '00000000-0000-4000-8000-000000000011', email: 'cio.greyconcrete@hub.group', prenom: 'Ousseynou', nom: 'Camara' },
] as const;

export type RoleDemo = (typeof COMPTES_DEMO)[number]['role'];

export async function creerComptesDemo(
  prisma: PrismaClient,
  societeId: string,
  motDePasseHash: string,
): Promise<Record<RoleDemo, { id: string; email: string }>> {
  const comptes = {} as Record<RoleDemo, { id: string; email: string }>;
  for (const c of COMPTES_DEMO) {
    // Rôle propre à la société ou transverse (CEO/CTO/CIO, societeId null) —
    // l'affectation, elle, est toujours rattachée à la société (même règle
    // que l'écran Comptes & rôles).
    const role = await prisma.role.findFirstOrThrow({
      where: { nom: c.role, supprimeLe: null, OR: [{ societeId }, { societeId: null }] },
    });
    const u = await prisma.utilisateur.upsert({
      where: { email: c.email },
      update: {},
      create: { id: c.id, email: c.email, motDePasseHash, prenom: c.prenom, nom: c.nom },
    });
    const dejaRattache = await prisma.utilisateurSocieteRole.findFirst({
      where: { utilisateurId: u.id, societeId },
    });
    if (!dejaRattache) {
      await prisma.utilisateurSocieteRole.create({
        data: { utilisateurId: u.id, societeId, roleId: role.id },
      });
    }
    comptes[c.role] = { id: u.id, email: u.email };
  }
  return comptes;
}

// Exécution autonome : npm run comptes-demo (depuis backend/).
if (require.main === module) {
  verifierEnvironnementDemo();
  const prisma = new PrismaClient();
  (async () => {
    const grey = await prisma.societe.findUniqueOrThrow({ where: { slug: 'grey-concrete' } });
    const hash = await bcrypt.hash(MOT_DE_PASSE_DEMO, 12); // COUT_BCRYPT
    await creerComptesDemo(prisma, grey.id, hash);
    const lignes = await prisma.utilisateurSocieteRole.findMany({
      where: { societeId: grey.id, utilisateur: { email: { in: COMPTES_DEMO.map((c) => c.email) } } },
      select: { role: { select: { nom: true } }, utilisateur: { select: { email: true, prenom: true, nom: true } } },
    });
    console.log(`Comptes de démonstration Grey Concrete (mdp : ${MOT_DE_PASSE_DEMO})`);
    for (const l of lignes.sort((a, b) => a.role.nom.localeCompare(b.role.nom, 'fr'))) {
      const u = l.utilisateur;
      console.log(`  · ${u.email.padEnd(34)} ${l.role.nom.padEnd(18)} ${u.prenom} ${u.nom}`);
    }
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
