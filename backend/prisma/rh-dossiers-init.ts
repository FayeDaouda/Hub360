import { PrismaClient } from '@prisma/client';

// Ouvre un dossier RH pour chaque fiche collaborateur qui n'en a pas encore,
// avec les SEULES données déjà connues (nom, poste, société, date d'arrivée,
// lien à l'équipe) : le reste est à compléter par la RH, la complétude le dit.
// Idempotent (npm run rh-dossiers-init).
async function main() {
  const prisma = new PrismaClient();
  try {
    const sans = await prisma.collaborateur.findMany({
      where: { dossierPersonnel: null },
      orderBy: [{ dateArrivee: 'asc' }, { createdAt: 'asc' }],
    });
    const dernier = await prisma.dossierPersonnel.findFirst({ orderBy: { matricule: 'desc' }, select: { matricule: true } });
    let n = dernier ? Number(dernier.matricule.replace(/\D/g, '')) : 0;
    for (const c of sans) {
      n += 1;
      await prisma.dossierPersonnel.create({
        data: {
          matricule: `GH-${String(n).padStart(4, '0')}`,
          societeId: c.societeId,
          collaborateurId: c.id,
          prenom: c.prenom,
          nom: c.nom,
          poste: c.role,
          dateEntree: c.dateArrivee,
        },
      });
    }
    console.log(`${sans.length} dossier(s) ouvert(s) ; total : ${await prisma.dossierPersonnel.count()}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
