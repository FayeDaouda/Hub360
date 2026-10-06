import type { PrismaService } from '../../prisma/prisma.service';

// Validation d'une remise (maquettes « Projets ») : le chef de team valide ;
// l'Architecte DPLG (rôle Dir. GC) valide les tâches du chef de team et
// supplée le chef de team partout. Personne ne valide sa propre tâche.

export const ROLE_DPLG = 'Dir. GC';

export type Decideur = { role: string; collaborateurId: string | null };

export function peutDecider(d: Decideur, t: { statut: string; assigneId: string | null }, chefId: string | null): boolean {
  if (t.statut !== 'a_valider') return false;
  if (d.collaborateurId && d.collaborateurId === t.assigneId) return false; // jamais sa propre tâche
  if (d.role === ROLE_DPLG || d.role === 'societe_admin') return true;
  return !!chefId && d.collaborateurId === chefId && t.assigneId !== chefId;
}

// Fiche d'équipe du compte connecté (directe, ou via son dossier RH).
export async function collaborateurDuCompte(prisma: PrismaService, societeId: string, userId: string): Promise<string | null> {
  const c = await prisma.collaborateur.findFirst({
    where: { societeId, OR: [{ utilisateurId: userId }, { dossierPersonnel: { utilisateurId: userId } }] },
    select: { id: true },
  });
  return c?.id ?? null;
}
