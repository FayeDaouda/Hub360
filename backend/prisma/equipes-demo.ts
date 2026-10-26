import {
  PrismaClient,
  type ClienteleCellule,
  type EtatPosteCellule,
  type ProcessusCellule,
  type StatutCellule,
} from '@prisma/client';
import { codeCellule, prefixeSociete } from '../src/equipe/equipes-regles';
import { verifierEnvironnementDemo } from './garde-demo';

// Cellules FICTIVES de démonstration (maquette « Équipes », oct. 2026) :
// nomenclature ISO 9001, statuts, clientèles, pilotes et postes — tous les
// états de la maquette (poste occupé, ouvert à affecter, reporté, à recruter,
// prestataires externes ; cellule active, à constituer, reportée).
//
// Utilisé par seed.ts ET exécutable seul (npm run equipes-demo) : idempotent,
// les cellules sont retrouvées par leur code, les collaborateurs par leur nom
// (créés par le seed). Un collaborateur d'une cellule de démo qui n'y figure
// plus en sort (« salarié à affecter »).

type Poste = [libelle: string, etat: EtatPosteCellule, titulaire?: string];

export type CelluleDemo = {
  cle: string; // clé du seed (rattachement des projets, fils de discussion)
  processus: ProcessusCellule;
  numero: number;
  nom: string; // nom d'usage
  clientele: ClienteleCellule;
  statut: StatutCellule;
  pilote: string | null; // « Prénom Nom »
  postes: Poste[];
  autresMembres?: string[]; // membres sans poste
};

const CAD = (n: number, titulaire?: string, etat: EtatPosteCellule = titulaire ? 'occupe' : 'ouvert'): Poste => [
  `CAD L${n}`,
  etat,
  titulaire,
];

export const CELLULES_DEMO: CelluleDemo[] = [
  {
    cle: 'Direction',
    processus: 'DIR',
    numero: 1,
    nom: 'Direction Grey Concrete',
    clientele: 'sans_objet',
    statut: 'active',
    pilote: 'Cheikh Sarr',
    postes: [['Architecte DPLG', 'occupe', 'Cheikh Sarr']],
  },
  {
    cle: 'Cellule Archi 1',
    processus: 'ARC',
    numero: 1,
    nom: 'Architecture 1 — Projets Holding',
    clientele: 'holding',
    statut: 'active',
    pilote: 'Aïssatou Faye',
    postes: [CAD(1, 'Aïssatou Faye'), CAD(2, 'Lamine Diallo'), CAD(3)],
  },
  {
    cle: 'Cellule Archi 2',
    processus: 'ARC',
    numero: 2,
    nom: 'Architecture 2 — Clients externes',
    clientele: 'externes',
    statut: 'active',
    pilote: 'Ousmane Bâ',
    postes: [CAD(1, 'Ousmane Bâ'), CAD(2, 'Bineta Ndour'), CAD(3, 'Khadija Sow')],
  },
  {
    cle: 'Cellule Archi 3',
    processus: 'ARC',
    numero: 3,
    nom: 'Architecture 3 — Clients externes',
    clientele: 'externes',
    statut: 'active',
    pilote: 'Mariama Cissé',
    postes: [CAD(1, 'Mariama Cissé'), CAD(2, 'Serigne Top'), CAD(3, 'Aliou Ndiaye')],
  },
  {
    cle: 'Cellule Archi 4',
    processus: 'ARC',
    numero: 4,
    nom: 'Architecture 4 — Clients externes',
    clientele: 'externes',
    statut: 'active',
    pilote: 'Fatoumata Bâ',
    postes: [CAD(1, 'Fatoumata Bâ'), CAD(2, 'Ibrahima Kane'), CAD(3, undefined, 'reporte')],
  },
  {
    cle: 'Architecture 5',
    processus: 'ARC',
    numero: 5,
    nom: 'Architecture 5 — Clients externes',
    clientele: 'externes',
    statut: 'reportee',
    pilote: null,
    postes: [CAD(1, undefined, 'reporte'), CAD(2, undefined, 'reporte'), CAD(3, undefined, 'reporte')],
  },
  {
    cle: 'Cellule Intérieur',
    processus: 'INT',
    numero: 1,
    nom: 'Architecture intérieure',
    clientele: 'tous',
    statut: 'active',
    pilote: null,
    postes: [
      ['Head of Interior Architecture', 'a_recruter'],
      ['CAD 3D L1', 'occupe', 'Ndèye Diagne'],
      ['CAD 3D L2', 'occupe', 'Pape Mbengue'],
      ['Décoration', 'occupe', 'Aminata Thiam'],
    ],
  },
  {
    cle: 'Cellule Études',
    processus: 'ETU',
    numero: 1,
    nom: 'Études et ingénierie',
    clientele: 'tous',
    statut: 'a_constituer',
    pilote: null,
    postes: [
      ['Head of Engineering & Technical Studies', 'a_recruter'],
      ['Ingénieur structure', 'occupe', 'Malick Sy'],
      ['Ingénieur lots techniques', 'a_recruter'],
      ['Ingénieur métreur', 'a_recruter'],
      ['Bureaux d’études (géotechnique, BA, lots techniques)', 'externe'],
    ],
    autresMembres: ['Rokhaya Ndoye', 'Souleymane Fall'],
  },
];

export async function organiserEquipesDemo(prisma: PrismaClient, societeId: string): Promise<Record<string, string>> {
  const societe = await prisma.societe.findUniqueOrThrow({ where: { id: societeId }, select: { nom: true } });
  const prefixe = prefixeSociete(societe.nom);
  const collaborateurs = await prisma.collaborateur.findMany({
    where: { societeId },
    select: { id: true, prenom: true, nom: true },
  });
  const idDe = (nom: string) => {
    const c = collaborateurs.find((x) => `${x.prenom} ${x.nom}` === nom);
    if (!c) throw new Error(`Collaborateur de démonstration introuvable : ${nom}`);
    return c.id;
  };

  const ids: Record<string, string> = {};
  for (const d of CELLULES_DEMO) {
    const code = codeCellule(prefixe, d.processus, d.numero);
    const champs = { nom: d.nom, clientele: d.clientele, statut: d.statut };
    const cellule = await prisma.cellule.upsert({
      where: { societeId_code: { societeId, code } },
      create: { societeId, processus: d.processus, numero: d.numero, code, ...champs },
      update: champs,
    });
    // Le compteur ne redescend jamais : un code n'est pas réutilisé.
    const compteur = await prisma.compteurCellule.findUnique({
      where: { societeId_processus: { societeId, processus: d.processus } },
    });
    if (!compteur || compteur.dernier < d.numero) {
      await prisma.compteurCellule.upsert({
        where: { societeId_processus: { societeId, processus: d.processus } },
        create: { societeId, processus: d.processus, dernier: d.numero },
        update: { dernier: d.numero },
      });
    }

    const membres = [...d.postes.flatMap(([, , t]) => (t ? [idDe(t)] : [])), ...(d.autresMembres ?? []).map(idDe)];
    await prisma.collaborateur.updateMany({
      where: { celluleId: cellule.id, id: { notIn: membres } },
      data: { celluleId: null },
    });
    await prisma.collaborateur.updateMany({ where: { id: { in: membres } }, data: { celluleId: cellule.id } });
    await prisma.posteCellule.deleteMany({ where: { celluleId: cellule.id } });
    await prisma.posteCellule.createMany({
      data: d.postes.map(([libelle, etat, titulaire], ordre) => ({
        celluleId: cellule.id,
        libelle,
        etat,
        ordre,
        titulaireId: titulaire ? idDe(titulaire) : null,
      })),
    });
    await prisma.cellule.update({
      where: { id: cellule.id },
      data: { dispatcherId: d.pilote ? idDe(d.pilote) : null },
    });
    ids[d.cle] = cellule.id;
  }
  return ids;
}

// Exécution autonome : npm run equipes-demo (depuis backend/).
if (require.main === module) {
  verifierEnvironnementDemo();
  const prisma = new PrismaClient();
  (async () => {
    const grey = await prisma.societe.findUniqueOrThrow({ where: { slug: 'grey-concrete' } });
    const ids = await organiserEquipesDemo(prisma, grey.id);
    console.log(`Cellules de démonstration organisées : ${Object.keys(ids).length}.`);
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
