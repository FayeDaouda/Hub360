import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

// Validation d'une remise (maquettes « Projets ») : le chef de team valide ;
// l'Architecte DPLG (rôle Dir. GC) valide les tâches du chef de team et
// supplée le chef de team partout. Personne ne valide sa propre tâche.
//
// Revue Dir. GC (21/10/2026, lot 4) — le CTO, niveau au-dessus du Dir. GC :
//   · valide les tâches assignées à un Dir. GC ;
//   · tient la place d'un Dir. GC absent (absence validée) qui n'a pas confié
//     sa suppléance à un autre Dir. GC ;
//   · décide seul des prolongations qui repoussent la livraison du projet et
//     des TS au-delà du seuil des Réglages.

export const ROLE_DPLG = 'Dir. GC';
export const ROLE_CTO = 'CTO (transverse)';

// Salarié (matrice : projets en lecture, 06/10/2026) : il ne voit que les
// projets où une tâche lui est assignée, et ceux de la cellule qu'il pilote
// (chef de team : il valide les remises de son équipe).
export const ROLE_SALARIE = 'Salarié';

// CEO et CFO (étape 1, 12/10/2026) : vue gabarit en lecture, projets à
// « lecture » dans la matrice. Exception ciblée : ils écrivent dans les fils
// de discussion, sans aucune action de circuit (remise, validation, renvoi,
// assignation, prolongation, TS) — refusées ici quel que soit leur niveau.
export const ROLE_CEO = 'CEO (transverse)';
export const ROLE_CFO = 'CFO';
const ROLES_HORS_CIRCUIT = new Set([ROLE_CEO, ROLE_CFO]);
const ROLES_COMMENTAIRE_FIL = new Set([ROLE_CEO, ROLE_CFO]);

export const horsCircuit = (role: string) => ROLES_HORS_CIRCUIT.has(role);
export const commenteSansEcriture = (role: string) => ROLES_COMMENTAIRE_FIL.has(role);

export function verifierCircuit(role: string) {
  if (horsCircuit(role))
    throw new ForbiddenException(
      'Votre rôle consulte et commente les projets ; il n’agit pas sur le circuit des tâches.',
    );
}

export function perimetreProjets(role: string, collaborateurId: string | null): Prisma.ProjetWhereInput {
  if (role !== ROLE_SALARIE) return {};
  const id = collaborateurId ?? '__aucun__';
  return {
    OR: [
      { cartes: { some: { taches: { some: { assigneId: id } } } } },
      { cellules: { some: { cellule: { dispatcherId: id } } } },
    ],
  };
}

// `ctoSupplee` : le CTO tient aujourd'hui la place d'un Dir. GC absent.
export type Decideur = { role: string; collaborateurId: string | null; ctoSupplee?: boolean };
// `assigneEstDplg` : la tâche est assignée à un Dir. GC (validée par le CTO).
export type TacheRegle = { assigneId: string | null; assigneEstDplg?: boolean };

// Pouvoirs de l'Architecte DPLG : le Dir. GC, l'admin société, le CTO en suppléance.
export const agitCommeDplg = (d: Decideur) =>
  d.role === ROLE_DPLG || d.role === 'societe_admin' || (d.role === ROLE_CTO && !!d.ctoSupplee);
// Ce qui remonte au CTO (et à l'admin société).
const niveauCto = (d: Decideur) => d.role === ROLE_CTO || d.role === 'societe_admin';
const estChefDe = (d: Decideur, assigneId: string | null, chefId: string | null) =>
  !!chefId && d.collaborateurId === chefId && assigneId !== chefId;

export function peutDecider(d: Decideur, t: TacheRegle & { statut: string }, chefId: string | null): boolean {
  if (t.statut !== 'a_valider' || horsCircuit(d.role)) return false;
  if (d.collaborateurId && d.collaborateurId === t.assigneId) return false; // jamais sa propre tâche
  if (t.assigneEstDplg) return niveauCto(d);
  return agitCommeDplg(d) || estChefDe(d, t.assigneId, chefId);
}

// Qualifier un retard (décider d'une prolongation) : chef de team, sauf pour
// sa propre tâche ; Architecte DPLG (et admin société) partout ; le CTO seul
// quand la nouvelle date repousse la livraison du projet ou que la tâche est
// celle d'un Dir. GC.
export function peutQualifier(d: Decideur, t: TacheRegle, chefId: string | null, repousseLivraison = false): boolean {
  if (horsCircuit(d.role)) return false;
  if (d.collaborateurId && d.collaborateurId === t.assigneId) return false;
  if (t.assigneEstDplg || repousseLivraison) return niveauCto(d);
  return agitCommeDplg(d) || estChefDe(d, t.assigneId, chefId);
}

// Visa DPLG : il engage la signature de l'architecte — le Dir. GC (ou un
// autre Dir. GC en suppléance), l'admin société ; jamais le CTO.
export const peutViser = (role: string) => role === ROLE_DPLG || role === 'societe_admin';

// TS : le Dir. GC (ou son suppléant) l'ajoute jusqu'au seuil ; au-delà, il le
// demande et le CTO le valide (ou l'ajoute lui-même).
export type DroitTs = 'ajouter' | 'demander' | null;
export function droitTs(d: Decideur, montantHt: number, seuil: number): DroitTs {
  if (horsCircuit(d.role)) return null;
  if (niveauCto(d)) return 'ajouter';
  if (!agitCommeDplg(d)) return null;
  return montantHt > seuil ? 'demander' : 'ajouter';
}

// Fiche d'équipe du compte connecté (directe, ou via son dossier RH).
export async function collaborateurDuCompte(
  prisma: PrismaService,
  societeId: string,
  userId: string,
): Promise<string | null> {
  const c = await prisma.collaborateur.findFirst({
    where: { societeId, OR: [{ utilisateurId: userId }, { dossierPersonnel: { utilisateurId: userId } }] },
    select: { id: true },
  });
  return c?.id ?? null;
}
