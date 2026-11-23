import { ROLE_HUB_ADMIN } from '@hub/domain';
import type { PrismaService } from '../prisma/prisma.service';
import type { RightsService } from '../rights/rights.service';
import type { Acteur } from './agenda.service';

// Une personne vue comme pour une session (16/11/2026), hors de toute
// requête : le lien d'abonnement et la synchronisation avec Google ou Apple
// agissent en son nom. Même choix du rôle qu'à la connexion (celui de la
// société, sinon le rôle transverse) ; droits relus de la matrice. null :
// compte inactif, société inactive ou plus d'accès.
export async function acteurAgenda(
  prisma: PrismaService,
  rights: RightsService,
  utilisateurId: string,
  societeId: string,
): Promise<{
  acteur: Acteur;
  adminHub: boolean;
  sessionsValidesDepuis: Date | null;
  societe: { nom: string; slug: string };
} | null> {
  const [utilisateur, societe, affectations] = await Promise.all([
    prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: { actif: true, sessionsValidesDepuis: true },
    }),
    prisma.societe.findUnique({ where: { id: societeId }, select: { nom: true, slug: true, actif: true } }),
    prisma.utilisateurSocieteRole.findMany({
      where: { utilisateurId, OR: [{ societeId }, { societeId: null }], role: { supprimeLe: null } },
      select: { societeId: true, role: { select: { nom: true } } },
    }),
  ]);
  const acces = affectations.find((x) => x.societeId === societeId) ?? affectations.find((x) => x.societeId === null);
  if (!utilisateur?.actif || !societe?.actif || !acces) return null;
  const role = acces.role.nom;
  const adminHub = role === ROLE_HUB_ADMIN;
  const permissions = await rights.forUser({ userId: utilisateurId, societeId, role, adminHub });
  return {
    acteur: { userId: utilisateurId, societeId, role, permissions },
    adminHub,
    sessionsValidesDepuis: utilisateur.sessionsValidesDepuis,
    societe: { nom: societe.nom, slug: societe.slug },
  };
}
