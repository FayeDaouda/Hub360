import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

// Validation d'une remise (maquettes « Projets ») : le chef de team valide ;
// l'Architecte DPLG (rôle Dir. GC) valide les tâches du chef de team et
// supplée le chef de team partout. Personne ne valide sa propre tâche.

export const ROLE_DPLG = 'Dir. GC';

// Salarié (matrice : projets en lecture, 06/10/2026) : il ne voit que les
// projets où une tâche lui est assignée, et ceux de la cellule qu'il pilote
// (chef de team : il valide les remises de son équipe).
export const ROLE_SALARIE = 'Salarié';

export function perimetreProjets(role: string, collaborateurId: string | null): Prisma.ProjetWhereInput {
  if (role !== ROLE_SALARIE) return {};
  const id = collaborateurId ?? '__aucun__';
  return {
    OR: [{ cartes: { some: { taches: { some: { assigneId: id } } } } }, { cellules: { some: { cellule: { dispatcherId: id } } } }],
  };
}

export type Decideur = { role: string; collaborateurId: string | null };

export function peutDecider(d: Decideur, t: { statut: string; assigneId: string | null }, chefId: string | null): boolean {
  if (t.statut !== 'a_valider') return false;
  if (d.collaborateurId && d.collaborateurId === t.assigneId) return false; // jamais sa propre tâche
  if (d.role === ROLE_DPLG || d.role === 'societe_admin') return true;
  return !!chefId && d.collaborateurId === chefId && t.assigneId !== chefId;
}

// Qualifier un retard (décider d'une prolongation) : chef de team, sauf pour
// sa propre tâche ; Architecte DPLG (et admin société) partout.
export function peutQualifier(d: Decideur, assigneId: string | null, chefId: string | null): boolean {
  if (d.collaborateurId && d.collaborateurId === assigneId) return false;
  if (d.role === ROLE_DPLG || d.role === 'societe_admin') return true;
  return !!chefId && d.collaborateurId === chefId && assigneId !== chefId;
}

// Fiche d'équipe du compte connecté (directe, ou via son dossier RH).
export async function collaborateurDuCompte(prisma: PrismaService, societeId: string, userId: string): Promise<string | null> {
  const c = await prisma.collaborateur.findFirst({
    where: { societeId, OR: [{ utilisateurId: userId }, { dossierPersonnel: { utilisateurId: userId } }] },
    select: { id: true },
  });
  return c?.id ?? null;
}
