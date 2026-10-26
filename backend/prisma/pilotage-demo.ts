import { PrismaClient } from '@prisma/client';
import { verifierEnvironnementDemo } from './garde-demo';

// Décisions FICTIVES de démonstration au registre (maquette « Pilotage »,
// oct. 2026) : deux décisions saisies par des instances — l'une dans les
// délais, l'autre à échéance dépassée. Les décisions inscrites par le HUB
// (avenants, permissions, reportings, Réglages) se dérivent seules.
//
// Utilisé par seed.ts ET exécutable seul (npm run pilotage-demo) : idempotent,
// chaque décision est retrouvée par sa clé de démonstration.

type DecisionDemo = {
  cle: string;
  date: string;
  instance: string;
  texte: string;
  responsable: { role: string; libelle: string } | { collaborateur: string }; // « Prénom Nom »
  echeance: string;
};

const DECISIONS_DEMO: DecisionDemo[] = [
  {
    cle: 'demo:codir-arc-05',
    date: '2026-09-14',
    instance: 'CODIR',
    texte: 'Ouverture de GC-ARC-05 (Architecture 5 — Clients externes) reportée au T1 2027',
    responsable: { role: 'CTO (transverse)', libelle: 'CTO' },
    echeance: '2026-12-31',
  },
  {
    cle: 'demo:coordination-fs-poi',
    date: '2026-09-21',
    instance: 'Coordination opérationnelle',
    texte: 'Relancer le client de FS_POI.26 pour ses remarques sur les plans d’exécution',
    responsable: { collaborateur: 'Ousmane Bâ' },
    echeance: '2026-09-22',
  },
];

export async function creerPilotageDemo(prisma: PrismaClient, societeId: string) {
  for (const d of DECISIONS_DEMO) {
    if (await prisma.decisionRegistre.findUnique({ where: { societeId_cleOrigine: { societeId, cleOrigine: d.cle } } }))
      continue;
    let responsable: { responsable: string; responsableRole: string | null; responsableCollaborateurId: string | null };
    if ('role' in d.responsable) {
      responsable = {
        responsable: d.responsable.libelle,
        responsableRole: d.responsable.role,
        responsableCollaborateurId: null,
      };
    } else {
      const nom = d.responsable.collaborateur;
      const c = (
        await prisma.collaborateur.findMany({ where: { societeId }, select: { id: true, prenom: true, nom: true } })
      ).find((x) => `${x.prenom} ${x.nom}` === nom);
      if (!c) throw new Error(`Collaborateur de démonstration introuvable : ${nom}`);
      responsable = { responsable: nom, responsableRole: null, responsableCollaborateurId: c.id };
    }
    const max = await prisma.decisionRegistre.aggregate({ where: { societeId }, _max: { numero: true } });
    await prisma.decisionRegistre.create({
      data: {
        societeId,
        numero: (max._max.numero ?? 0) + 1,
        date: d.date,
        instance: d.instance,
        origine: 'saisie',
        cleOrigine: d.cle,
        texte: d.texte,
        ...responsable,
        echeance: d.echeance,
      },
    });
  }
}

// Exécution autonome : npm run pilotage-demo (depuis backend/).
if (require.main === module) {
  verifierEnvironnementDemo();
  const prisma = new PrismaClient();
  (async () => {
    const grey = await prisma.societe.findUniqueOrThrow({ where: { slug: 'grey-concrete' } });
    await creerPilotageDemo(prisma, grey.id);
    console.log(`Registre de démonstration : ${DECISIONS_DEMO.length} décision(s) saisie(s).`);
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
