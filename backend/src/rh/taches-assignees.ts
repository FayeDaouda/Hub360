import { StatutTacheProjet } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Tache } from './regles-temps';

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
  chefId: string | null; // chef de team de la cellule du projet (circuit de validation)
  derniereRelance: Date | null; // dernière relance du validateur par l'assigné
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
      projet: {
        select: { id: true, code: true, programme: true, client: { select: { nom: true } }, cellules: { take: 1, select: { cellule: { select: { dispatcherId: true } } } } },
      },
      evenements: { where: { type: { in: ['remise', 'reprise', 'relance'] } }, orderBy: { creeLe: 'desc' }, select: { type: true, detail: true, creeLe: true } },
    },
  });
  return taches.map((t) => {
    const remise = t.evenements.find((e) => e.type === 'remise') ?? null;
    const reprise = t.evenements.find((e) => e.type === 'reprise') ?? null;
    const relance = t.evenements.find((e) => e.type === 'relance') ?? null;
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
      chefId: t.projet.cellules?.[0]?.cellule.dispatcherId ?? null,
      derniereRelance: relance?.creeLe ?? null,
    };
  });
}
