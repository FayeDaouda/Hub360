import { StatutTacheProjet } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CHIEF_CELL, chiefOf } from '../projects/project-query';
import type { Tache } from '../rh/regles-temps';

// Une tâche assignée = une tâche du gabarit (TacheProjet) assignée au
// collaborateur, depuis le passage de Mon espace et des feuilles de temps sur
// le gabarit (oct. 2026). Durée standard et fenêtre figées sur la tâche ;
// les tâches « non nécessaires » et celles d'une carte désactivée ne comptent pas.
// Les blocs de checklist (lot 4) ne produisent plus d'heures.
export type AssignedTask = Tache & {
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
  chefId: string | null; // chef de team de la cellule du projet (circuit de validation)
  etapeNumero: number;
  fichierObligatoire: boolean;
  parDepot: boolean; // sans temps atelier : le dépôt du justificatif vaut validation
  derniereRelance: Date | null; // dernière relance du validateur par l'assigné
};

const stepNumber = (n: number) => String(n).padStart(2, '0');

export async function loadAssignedTasks(prisma: PrismaService, employeeIds: string[]): Promise<AssignedTask[]> {
  if (employeeIds.length === 0) return [];
  const tasks = await prisma.tacheProjet.findMany({
    where: {
      assigneId: { in: employeeIds },
      statut: { not: 'non_necessaire' },
      carte: { desactivation: null },
      projet: { ouvertLe: { not: null } },
    },
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
      temps: true,
      fichierObligatoire: true,
      carte: { select: { libelle: true, etapeNumero: true, etapeLibelle: true } },
      projet: {
        select: {
          id: true,
          code: true,
          programme: true,
          client: { select: { nom: true } },
          cellules: CHIEF_CELL,
        },
      },
      evenements: {
        where: { type: { in: ['remise', 'reprise', 'relance'] } },
        orderBy: { creeLe: 'desc' },
        select: { type: true, detail: true, creeLe: true },
      },
    },
  });
  return tasks.map((t) => {
    const submission = t.evenements.find((e) => e.type === 'remise') ?? null;
    const rework = t.evenements.find((e) => e.type === 'reprise') ?? null;
    const reminder = t.evenements.find((e) => e.type === 'relance') ?? null;
    return {
      id: t.id,
      collaborateurId: t.assigneId!,
      libelle: t.libelle,
      etape: `${stepNumber(t.carte.etapeNumero)} · ${t.carte.etapeLibelle}`,
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
      remisLe: submission?.creeLe ?? null,
      // « Remise vNN renvoyée en reprise : motif » → motif
      renvoiMotif: t.statut === 'reprise' && rework ? rework.detail.replace(/^.*?reprise : /, '') : null,
      chefId: chiefOf(t.projet),
      etapeNumero: t.carte.etapeNumero,
      fichierObligatoire: t.fichierObligatoire ?? false,
      parDepot: (t.temps as { type?: string } | null)?.type === 'sans',
      derniereRelance: reminder?.creeLe ?? null,
    };
  });
}
