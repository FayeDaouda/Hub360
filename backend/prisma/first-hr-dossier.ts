import { PrismaClient } from '@prisma/client';
import { ROLE_HR } from '@hub/domain';

// Premier dossier RH d'une VRAIE installation. Seul le rôle RH ouvre les
// dossiers, et un compte ne se crée qu'à partir d'un dossier (parcours du
// 14/10/2026) : sur une base neuve, où le CIO est seul, personne ne pourrait
// ouvrir le premier. Ce script ouvre celui de la personne RH, avec son
// identité seule ; le CIO crée ensuite son compte (Nouveau compte, rôle RH),
// puis la RH ouvre les autres dossiers dans le HUB. Refusé dès qu'un compte
// RH existe : ce n'est pas un second chemin vers les dossiers.
//
//   HUB_RH_EMAIL=… HUB_RH_PRENOM=… HUB_RH_NOM=… [HUB_RH_POSTE=…] npm run first-hr-dossier
//
// Ne touche ni au socle ni à la matrice (relancer le démarrage remettrait la
// matrice aux valeurs du socle). Rejouable : un dossier déjà ouvert est gardé.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMPANY_SLUG = 'grey-concrete';

function readPerson() {
  const email = process.env.HUB_RH_EMAIL?.trim().toLowerCase() ?? '';
  const prenom = process.env.HUB_RH_PRENOM?.trim() ?? '';
  const nom = process.env.HUB_RH_NOM?.trim() ?? '';
  const poste = process.env.HUB_RH_POSTE?.trim() ?? '';
  if (!EMAIL.test(email) || !prenom || !nom) {
    throw new Error('Renseigner HUB_RH_EMAIL (adresse valide), HUB_RH_PRENOM et HUB_RH_NOM.');
  }
  return { email, prenom, nom, poste };
}

async function main() {
  const person = readPerson();
  const prisma = new PrismaClient();
  try {
    const company = await prisma.societe.findUnique({ where: { slug: COMPANY_SLUG }, select: { id: true } });
    if (!company) throw new Error('Société Grey Concrete absente : lancer d’abord le démarrage.');

    // Compte RH actif, ou invité et pas encore activé : la RH est là.
    const hr = await prisma.utilisateurSocieteRole.findFirst({
      where: {
        societeId: company.id,
        role: { nom: ROLE_HR, supprimeLe: null },
        utilisateur: { OR: [{ actif: true }, { motDePasseHash: null }] },
      },
      select: { utilisateur: { select: { email: true } } },
    });
    if (hr) {
      throw new Error(`Un compte RH existe déjà (${hr.utilisateur.email}) : la RH ouvre les dossiers dans le HUB.`);
    }

    const existing = await prisma.dossierPersonnel.findFirst({
      where: { societeId: company.id, archiveLe: null, emailPro: { equals: person.email, mode: 'insensitive' } },
      select: { matricule: true },
    });
    if (existing) {
      console.log(`Dossier RH déjà ouvert : ${existing.matricule} (${person.email}).`);
    } else {
      // Même numérotation que DossiersPersonnelService (GH-0001, séquence groupe).
      const last = await prisma.dossierPersonnel.findFirst({
        orderBy: { matricule: 'desc' },
        select: { matricule: true },
      });
      const n = last ? Number(last.matricule.replace(/\D/g, '')) + 1 : 1;
      const created = await prisma.dossierPersonnel.create({
        data: {
          matricule: `GH-${String(n).padStart(4, '0')}`,
          societeId: company.id,
          prenom: person.prenom,
          nom: person.nom,
          poste: person.poste,
          emailPro: person.email,
        },
        select: { matricule: true },
      });
      console.log(`Dossier RH ouvert : ${created.matricule} · ${person.prenom} ${person.nom} (${person.email}).`);
    }
    console.log(
      'Suite : le CIO crée le compte dans le HUB (Nouveau compte → ce dossier → rôle RH) ; l’invitation part par e-mail.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
