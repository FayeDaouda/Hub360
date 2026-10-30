import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ROLE_CEO, ROLE_CFO, ROLE_COMPANY_ADMIN, ROLE_CTO, ROLE_DIR_GC, ROLE_EMPLOYEE } from '@hub/domain';

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

// CEO et CFO (étape 1, 12/10/2026) : vue gabarit en lecture, projets à
// « lecture » dans la matrice. Exception ciblée : ils écrivent dans les fils
// de discussion, sans aucune action de circuit (remise, validation, renvoi,
// assignation, prolongation, TS) — refusées ici quel que soit leur niveau.
const OUTSIDE_CIRCUIT_ROLES = new Set([ROLE_CEO, ROLE_CFO]);
const THREAD_COMMENT_ROLES = new Set([ROLE_CEO, ROLE_CFO]);

export const outsideCircuit = (role: string) => OUTSIDE_CIRCUIT_ROLES.has(role);
export const commentsWithoutWrite = (role: string) => THREAD_COMMENT_ROLES.has(role);

export function assertInCircuit(role: string) {
  if (outsideCircuit(role))
    throw new ForbiddenException(
      'Votre rôle consulte et commente les projets ; il n’agit pas sur le circuit des tâches.',
    );
}

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
export type Decider = { role: string; employeeId: string | null; ctoStandsIn: boolean };
// `assigneeIsDplg` : la tâche est assignée à un Dir. GC (validée par le CTO).
export type TaskRule = { assigneId: string | null; assigneeIsDplg: boolean };

// Pouvoirs de l'Architecte DPLG : le Dir. GC, l'admin société, le CTO en suppléance.
export const actsAsDplg = (d: Decider) =>
  d.role === ROLE_DIR_GC || d.role === ROLE_COMPANY_ADMIN || (d.role === ROLE_CTO && d.ctoStandsIn);
// Ce qui remonte au CTO (et à l'admin société).
const ctoLevel = (d: Decider) => d.role === ROLE_CTO || d.role === ROLE_COMPANY_ADMIN;
const isChiefOf = (d: Decider, assigneId: string | null, chiefId: string | null) =>
  !!chiefId && d.employeeId === chiefId && assigneId !== chiefId;

export function canDecide(d: Decider, t: TaskRule & { statut: string }, chiefId: string | null): boolean {
  if (t.statut !== 'a_valider' || outsideCircuit(d.role)) return false;
  if (d.employeeId && d.employeeId === t.assigneId) return false; // jamais sa propre tâche
  if (t.assigneeIsDplg) return ctoLevel(d);
  return actsAsDplg(d) || isChiefOf(d, t.assigneId, chiefId);
}

// Qualifier un retard (décider d'une prolongation) : chef d’équipe, sauf pour
// sa propre tâche ; Architecte DPLG (et admin société) partout ; le CTO seul
// quand la nouvelle date repousse la livraison du projet ou que la tâche est
// celle d'un Dir. GC.
export function canQualify(d: Decider, t: TaskRule, chiefId: string | null, pushesBackDelivery = false): boolean {
  if (outsideCircuit(d.role)) return false;
  if (d.employeeId && d.employeeId === t.assigneId) return false;
  if (t.assigneeIsDplg || pushesBackDelivery) return ctoLevel(d);
  return actsAsDplg(d) || isChiefOf(d, t.assigneId, chiefId);
}

// Visa DPLG : il engage la signature de l'architecte — le Dir. GC (ou un
// autre Dir. GC en suppléance), l'admin société ; jamais le CTO.
export const canVisa = (role: string) => role === ROLE_DIR_GC || role === ROLE_COMPANY_ADMIN;

// TS : le Dir. GC (ou son suppléant) l'ajoute jusqu'au seuil ; au-delà, il le
// demande et le CTO le valide (ou l'ajoute lui-même).
export type TsRight = 'ajouter' | 'demander' | null;
export function tsRight(d: Decider, amountHt: number, threshold: number): TsRight {
  if (outsideCircuit(d.role)) return null;
  if (ctoLevel(d)) return 'ajouter';
  if (!actsAsDplg(d)) return null;
  return amountHt > threshold ? 'demander' : 'ajouter';
}

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
