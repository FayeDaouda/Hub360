import { Prisma, SectionTache } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GROUPES_CHECKLIST_AVP,
  GROUPES_CHECKLIST_EXECUTION,
  GROUPES_CHECKLIST_PERMIS,
} from '../projets/domaine/config';
import type { Tache } from './regles-temps';

// RH · Temps (lot 4) : une tâche assignée = un bloc de checklist dont le
// collaborateur est responsable (assignation par bloc, décision boss). Seuls
// les blocs ACTIFS des gabarits comptent : un bloc retiré d'une checklist
// (ex. Études/Plans en Exécution) peut rester en base, il ne produit plus
// d'heures.
export const SECTIONS_TACHES: {
  section: SectionTache;
  libelle: string;
  groupes: { groupe: string; libelle: string }[];
}[] = [
  { section: 'avant_projet', libelle: 'Avant-projet', groupes: GROUPES_CHECKLIST_AVP.map(({ groupe, libelle }) => ({ groupe, libelle })) },
  { section: 'permis', libelle: 'Permis', groupes: GROUPES_CHECKLIST_PERMIS.map(({ groupe, libelle }) => ({ groupe, libelle })) },
  { section: 'execution', libelle: 'Exécution', groupes: GROUPES_CHECKLIST_EXECUTION.map(({ groupe, libelle }) => ({ groupe, libelle })) },
];

export function groupeConnu(section: string, groupe: string): boolean {
  return SECTIONS_TACHES.some((s) => s.section === section && s.groupes.some((g) => g.groupe === groupe));
}

const libelleGroupe = (section: SectionTache, groupe: string) =>
  SECTIONS_TACHES.find((s) => s.section === section)?.groupes.find((g) => g.groupe === groupe)?.libelle ?? groupe;

export type TacheAssignee = Tache & {
  collaborateurId: string;
  section: SectionTache;
  groupe: string;
  libelle: string;
  projetId: string;
  projetCode: string;
  projetProgramme: string;
};

const PROJET = { id: true, code: true, programme: true, societeId: true } satisfies Prisma.ProjetSelect;
const BLOC = { groupe: true, debut: true, echeance: true, responsableId: true } as const;

type BlocCharge = {
  groupe: string;
  debut: string | null;
  echeance: string | null;
  responsableId: string | null;
  projet: { id: string; code: string; programme: string; societeId: string };
};

const cleDuree = (societeId: string, section: string, groupe: string) => `${societeId}:${section}:${groupe}`;

// Durées du référentiel société, lues en direct (null = non définie).
export async function chargerDurees(prisma: PrismaService, societeIds: string[]) {
  const lignes = await prisma.dureeStandardTache.findMany({ where: { societeId: { in: societeIds } } });
  return new Map(lignes.map((l) => [cleDuree(l.societeId, l.section, l.groupe), Number(l.heures)]));
}

export async function chargerTachesAssignees(prisma: PrismaService, collaborateurIds: string[]): Promise<TacheAssignee[]> {
  if (collaborateurIds.length === 0) return [];
  const responsableId = { in: collaborateurIds };
  const [avp, permis, execution] = await Promise.all([
    prisma.blocChecklistAvp.findMany({
      where: { responsableId, groupe: { in: GROUPES_CHECKLIST_AVP.map((g) => g.groupe) } },
      select: { ...BLOC, avantProjet: { select: { projet: { select: PROJET } } } },
    }),
    prisma.blocPermis.findMany({
      where: { responsableId, groupe: { in: GROUPES_CHECKLIST_PERMIS.map((g) => g.groupe) } },
      select: { ...BLOC, permis: { select: { projet: { select: PROJET } } } },
    }),
    prisma.blocExecution.findMany({
      where: { responsableId, groupe: { in: GROUPES_CHECKLIST_EXECUTION.map((g) => g.groupe) } },
      select: { ...BLOC, projet: { select: PROJET } },
    }),
  ]);
  const blocs: [SectionTache, BlocCharge][] = [
    ...avp.map(({ avantProjet, ...b }) => ['avant_projet', { ...b, projet: avantProjet.projet }] as [SectionTache, BlocCharge]),
    ...permis.map(({ permis: p, ...b }) => ['permis', { ...b, projet: p.projet }] as [SectionTache, BlocCharge]),
    ...execution.map((b) => ['execution', b] as [SectionTache, BlocCharge]),
  ];
  const durees = await chargerDurees(prisma, [...new Set(blocs.map(([, b]) => b.projet.societeId))]);

  return blocs.map(([section, b]) => ({
    id: `${section}:${b.projet.id}:${b.groupe}`,
    collaborateurId: b.responsableId!,
    section,
    groupe: b.groupe,
    libelle: libelleGroupe(section, b.groupe),
    projetId: b.projet.id,
    projetCode: b.projet.code,
    projetProgramme: b.projet.programme,
    debut: b.debut,
    echeance: b.echeance,
    heures: durees.get(cleDuree(b.projet.societeId, section, b.groupe)) ?? null,
  }));
}
