import { SectionTache, StatutTacheProjet } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GROUPES_CHECKLIST_AVP,
  GROUPES_CHECKLIST_EXECUTION,
  GROUPES_CHECKLIST_PERMIS,
} from '../projets/domaine/config';
import type { Tache } from './regles-temps';

// Blocs des checklists (lot 4) : référentiel des durées standard par bloc
// (Paramètres), conservé pour l'historique.
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

const cleDuree = (societeId: string, section: string, groupe: string) => `${societeId}:${section}:${groupe}`;

// Durées du référentiel société par bloc (Paramètres · Durées standard),
// lues en direct (null = non définie). Plus utilisées pour les heures depuis
// le gabarit : la durée est portée par la tâche.
export async function chargerDurees(prisma: PrismaService, societeIds: string[]) {
  const lignes = await prisma.dureeStandardTache.findMany({ where: { societeId: { in: societeIds } } });
  return new Map(lignes.map((l) => [cleDuree(l.societeId, l.section, l.groupe), Number(l.heures)]));
}

// Une tâche assignée = une tâche du gabarit (TacheProjet) assignée au
// collaborateur, depuis le passage de Mon espace et des feuilles de temps sur
// le gabarit (oct. 2026). Durée standard et fenêtre figées sur la tâche ;
// les tâches « non nécessaires » et celles d'une carte désactivée ne comptent pas.
// Les blocs de checklist (lot 4) ne produisent plus d'heures.
export type TacheAssignee = Tache & {
  collaborateurId: string;
  libelle: string;
  etape: string; // « 02 · Avant-projet »
  carte: string;
  projetId: string;
  projetCode: string;
  projetProgramme: string;
  projetClient: string;
  statut: StatutTacheProjet;
  version: number;
  valideeLe: Date | null;
  remisLe: Date | null; // dernière remise
  renvoiMotif: string | null; // dernier renvoi en reprise
};

const numeroEtape = (n: number) => String(n).padStart(2, '0');

export async function chargerTachesAssignees(prisma: PrismaService, collaborateurIds: string[]): Promise<TacheAssignee[]> {
  if (collaborateurIds.length === 0) return [];
  const taches = await prisma.tacheProjet.findMany({
    where: { assigneId: { in: collaborateurIds }, statut: { not: 'non_necessaire' }, carte: { desactivation: null }, projet: { ouvertLe: { not: null } } },
    select: {
      id: true,
      assigneId: true,
      libelle: true,
      debutLe: true,
      finLe: true,
      heures: true,
      statut: true,
      version: true,
      valideeLe: true,
      carte: { select: { libelle: true, etapeNumero: true, etapeLibelle: true } },
      projet: { select: { id: true, code: true, programme: true, client: { select: { nom: true } } } },
      evenements: { where: { type: { in: ['remise', 'reprise'] } }, orderBy: { creeLe: 'desc' }, select: { type: true, detail: true, creeLe: true } },
    },
  });
  return taches.map((t) => {
    const remise = t.evenements.find((e) => e.type === 'remise') ?? null;
    const reprise = t.evenements.find((e) => e.type === 'reprise') ?? null;
    return {
      id: t.id,
      collaborateurId: t.assigneId!,
      libelle: t.libelle,
      etape: `${numeroEtape(t.carte.etapeNumero)} · ${t.carte.etapeLibelle}`,
      carte: t.carte.libelle,
      projetId: t.projet.id,
      projetCode: t.projet.code,
      projetProgramme: t.projet.programme,
      projetClient: t.projet.client.nom,
      debut: t.debutLe,
      echeance: t.finLe,
      heures: t.heures === null ? null : Number(t.heures),
      statut: t.statut,
      version: t.version,
      valideeLe: t.valideeLe,
      remisLe: remise?.creeLe ?? null,
      // « Remise vNN renvoyée en reprise : motif » → motif
      renvoiMotif: t.statut === 'reprise' && reprise ? reprise.detail.replace(/^.*?reprise : /, '') : null,
    };
  });
}
