import { PrismaClient } from '@prisma/client';
import { codeAvecVariante, genererCodeDossier } from '../../src/crm/nomenclature';

// Régénère le code de TOUS les dossiers CRM (et de leur projet d'exécution,
// qui en garde une copie) selon la nomenclature CLIENT_LOC.AA.
//
// Décision du 26/09/2026 : les dossiers existants sont des données de démo
// fictives, aucun code n'a circulé à l'extérieur → migration complète vers
// le nouveau format. NE PAS relancer sur une base contenant de vrais dossiers
// déjà communiqués à des clients.
//
//   Aperçu (n'écrit rien) : npm run codes:regenerer
//   Application           : npm run codes:regenerer -- --appliquer
//
// Ordre : par date de création dans chaque société (le premier garde la
// base, les suivants prennent -2, -3…), année = celle de la création.
// Un dossier sans localité ou dont le client n'a pas de nom est signalé et
// laissé tel quel — le script n'invente aucune donnée.

const prisma = new PrismaClient();

async function main() {
  const appliquer = process.argv.includes('--appliquer');
  const dossiers = await prisma.dossierCrm.findMany({
    orderBy: [{ societeId: 'asc' }, { createdAt: 'asc' }],
    include: { client: true, localite: true, projet: { select: { id: true } } },
  });

  const prisParSociete = new Map<string, Set<string>>();
  const changements: { id: string; projetId: string | null; avant: string; apres: string }[] = [];
  const bloques: string[] = [];

  for (const d of dossiers) {
    const pris = prisParSociete.get(d.societeId) ?? new Set<string>();
    prisParSociete.set(d.societeId, pris);

    if (!d.localite) {
      bloques.push(`${d.code} — pas de localité rattachée`);
      pris.add(d.code);
      continue;
    }
    const base = genererCodeDossier(d.client, d.localite.code, d.createdAt);
    if (!base) {
      bloques.push(`${d.code} — nom du client manquant`);
      pris.add(d.code);
      continue;
    }
    const code = codeAvecVariante(base, pris);
    pris.add(code);
    changements.push({ id: d.id, projetId: d.projet?.id ?? null, avant: d.code, apres: code });
  }

  for (const c of changements) console.log(`${c.avant.padEnd(16)} → ${c.apres}`);
  for (const b of bloques) console.log(`NON TRAITÉ  ${b}`);
  console.log(`\n${changements.length} code(s) à régénérer, ${bloques.length} non traité(s).`);

  if (!appliquer) {
    console.log('Aperçu seulement — relancer avec --appliquer pour écrire.');
    return;
  }

  // Deux passes dans une transaction : codes temporaires puis définitifs,
  // pour ne jamais heurter l'unicité (société, code) pendant l'échange.
  await prisma.$transaction(async (tx) => {
    for (const c of changements) {
      await tx.dossierCrm.update({ where: { id: c.id }, data: { code: `~${c.id}` } });
    }
    for (const c of changements) {
      await tx.dossierCrm.update({ where: { id: c.id }, data: { code: c.apres } });
      if (c.projetId) {
        await tx.projet.update({ where: { id: c.projetId }, data: { code: c.apres } });
      }
    }
  });
  console.log('Codes régénérés.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
