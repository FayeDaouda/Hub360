import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ETAPE, hasRight, ROLE_COMPANY_ADMIN, ROLE_CTO, ROLE_EMPLOYEE } from '@hub/domain';

// Validation d'une remise (maquettes « Projets ») : le chef d’équipe valide ;
// l'Architecte DPLG (rôle Dir. GC) valide les tâches du chef d’équipe et
// supplée le chef d’équipe partout. Personne ne valide sa propre tâche.
//
// Revue Dir. GC (21/10/2026, lot 4) — le CTO, niveau au-dessus du Dir. GC :
//   · valide les tâches assignées à un Dir. GC ;
//   · tient la place d'un Dir. GC absent (absence validée) qui n'a pas confié
//     sa suppléance à un autre Dir. GC ;
//   · décide seul des prolongations qui repoussent la livraison du projet et
//     des TS au-delà du seuil des Réglages.

// Matrice des droits (lot 5, 31/10/2026) : chaque geste du circuit demande
// le droit de son étape — Assignation, Validation des remises, Visa DPLG,
// Prolongations, Travaux supplémentaires, Fils de discussion. Le CIRCUIT
// reste une règle d'organisation (décision du 01/11/2026) : la personne
// assignée remet sa tâche, le chef d'équipe agit sur son équipe, le CTO
// prend le travail d'un Dir. GC, personne ne valide sa propre tâche. Au
// départ, CEO et CFO n'ont aucun de ces droits : ils lisent et commentent.

type Droits = { permissions?: Record<string, string> };
const peut = (d: Droits, etape: string, droit: 'ecriture' | 'validation') => hasRight(d.permissions, etape, droit);

// Salarié (matrice : projets en lecture, 06/10/2026) : il voit les projets où
// une tâche lui est assignée, ceux de la cellule qu'il pilote (chef d'équipe :
// il valide les remises de son équipe et y assigne le travail) et, depuis le
// 29/10/2026, tous ceux affectés à son équipe.
export function projectScope(role: string, employeeId: string | null): Prisma.ProjetWhereInput {
  if (role !== ROLE_EMPLOYEE) return {};
  const id = employeeId ?? '__aucun__';
  return {
    OR: [
      { cartes: { some: { taches: { some: { assigneId: id } } } } },
      { cellules: { some: { cellule: { dispatcherId: id } } } },
      { cellules: { some: { cellule: { membres: { some: { id } } } } } },
    ],
  };
}

// `ctoStandsIn` : le CTO tient aujourd'hui la place d'un Dir. GC absent.
// `permissions` : droits par étape de la personne (matrice).
export type Decider = {
  role: string;
  employeeId: string | null;
  ctoStandsIn: boolean;
  permissions?: Record<string, string>;
};
// `assigneeIsDplg` : la tâche est assignée à un Dir. GC (validée par le CTO).
export type TaskRule = { assigneId: string | null; assigneeIsDplg: boolean };

// Niveau « Architecte DPLG » pour un droit donné : qui a ce droit, sauf le
// CTO hors suppléance (au départ : le Dir. GC, l'administration, le CTO quand
// il remplace un Dir. GC absent). Un rôle à qui le CIO donne le droit agit à ce
// niveau.
const niveauDplg = (d: Decider, etape: string) =>
  peut(d, etape, 'validation') && (d.role !== ROLE_CTO || d.ctoStandsIn);
// Ce qui remonte au CTO (et à l'administration) : le travail d'un Dir. GC,
// les prolongations qui repoussent la livraison.
const niveauCto = (d: Decider, etape: string) =>
  peut(d, etape, 'validation') && (d.role === ROLE_CTO || d.role === ROLE_COMPANY_ADMIN);
const isChiefOf = (d: Decider, assigneId: string | null, chiefId: string | null) =>
  !!chiefId && d.employeeId === chiefId && assigneId !== chiefId;

// Pouvoirs de l'Architecte DPLG sur les remises (aperçus, tableaux).
export const actsAsDplg = (d: Decider) => niveauDplg(d, ETAPE.projetsValidation);

// Valider une remise : Validation des remises, selon le circuit.
export function canDecide(d: Decider, t: TaskRule & { statut: string }, chiefId: string | null): boolean {
  if (t.statut !== 'a_valider') return false;
  if (d.employeeId && d.employeeId === t.assigneId) return false; // jamais sa propre tâche
  if (t.assigneeIsDplg) return niveauCto(d, ETAPE.projetsValidation);
  return niveauDplg(d, ETAPE.projetsValidation) || isChiefOf(d, t.assigneId, chiefId);
}

// Qualifier un retard (décider d'une prolongation) : chef d’équipe, sauf pour
// sa propre tâche ; niveau DPLG partout ; le CTO seul quand la nouvelle date
// repousse la livraison du projet ou que la tâche est celle d'un Dir. GC.
export function canQualify(d: Decider, t: TaskRule, chiefId: string | null, pushesBackDelivery = false): boolean {
  if (d.employeeId && d.employeeId === t.assigneId) return false;
  if (t.assigneeIsDplg || pushesBackDelivery) return niveauCto(d, ETAPE.projetsProlongations);
  return niveauDplg(d, ETAPE.projetsProlongations) || isChiefOf(d, t.assigneId, chiefId);
}

// Visa DPLG : il engage la signature de l'architecte — la Validation de
// l'étape « Visa DPLG » (au départ le Dir. GC et l'administration ; jamais le CTO).
export const canVisa = (d: Droits) => peut(d, ETAPE.projetsVisa, 'validation');

// TS : l'Écriture de l'étape les ajoute jusqu'au seuil ; au-delà, ils sont
// demandés, et la Validation les accorde (ou les ajoute d'emblée).
export type TsRight = 'ajouter' | 'demander' | null;
export function tsRight(d: Decider, amountHt: number, threshold: number): TsRight {
  if (peut(d, ETAPE.projetsTs, 'validation')) return 'ajouter';
  if (!peut(d, ETAPE.projetsTs, 'ecriture')) return null;
  return amountHt > threshold ? 'demander' : 'ajouter';
}

// Écrire dans les fils de discussion (étape « Fils de discussion »).
export const canWriteThreads = (d: Droits) => peut(d, ETAPE.projetsFils, 'ecriture');

// Fiche d'équipe du compte connecté (directe, ou via son dossier RH).
export async function employeeOfAccount(
  prisma: PrismaService,
  companyId: string,
  userId: string,
): Promise<string | null> {
  const c = await prisma.collaborateur.findFirst({
    where: { societeId: companyId, OR: [{ utilisateurId: userId }, { dossierPersonnel: { utilisateurId: userId } }] },
    select: { id: true },
  });
  return c?.id ?? null;
}
