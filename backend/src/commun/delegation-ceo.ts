import type { PrismaService } from '../prisma/prisma.service';
import { ETAPE, hasRight, ROLE_CEO, ROLE_CFO, ROLE_CTO, todayIso } from '@hub/domain';

// Délégation du CEO (revue CEO, 22/10/2026) — lecture commune à tous les
// modules (fonction, pas de service : aucun cycle de modules). Délégués :
// avoirs au-delà du seuil, arbitrage des décisions proposées, absences des
// directeurs (N+1 CEO) — dans la limite des droits du délégataire, jamais
// sur sa propre demande. Jamais délégués : droits du CIO, salaire du CFO.
export const ROLES_DELEGATAIRES: ReadonlySet<string> = new Set([ROLE_CTO, ROLE_CFO]);

// Compte du délégataire en fonction ce jour-là, ou null.
export async function delegataireCeo(
  prisma: PrismaService,
  societeId: string,
  jour = todayIso(),
): Promise<string | null> {
  const d = await prisma.delegationCeo.findFirst({
    where: { societeId, revoqueLe: null, du: { lte: jour }, au: { gte: jour } },
    orderBy: { createdAt: 'desc' },
    select: { delegataireId: true },
  });
  return d?.delegataireId ?? null;
}

// Le CEO, ou le délégataire en fonction.
export async function agitPourCeo(
  prisma: PrismaService,
  acteur: { userId: string; societeId: string; role: string },
): Promise<boolean> {
  if (acteur.role === ROLE_CEO) return true;
  if (!ROLES_DELEGATAIRES.has(acteur.role)) return false;
  return (await delegataireCeo(prisma, acteur.societeId)) === acteur.userId;
}

// Destinataires d'une décision du CEO : ses titulaires, plus le délégataire
// en fonction — sauf s'il est lui-même le demandeur.
export async function avecDelegataire(
  prisma: PrismaService,
  societeId: string,
  ceo: string[],
  demandeurId?: string | null,
): Promise<string[]> {
  const d = await delegataireCeo(prisma, societeId);
  return d && d !== demandeurId && !ceo.includes(d) ? [...ceo, d] : ceo;
}

// Contresignature des affaires au-delà du seuil (matrice, 31/10/2026) : la
// Validation de l'étape « Contresignature », la carte blanche, ou le
// délégataire du CEO en fonction.
export async function contresigne(
  prisma: PrismaService,
  acteur: {
    userId: string;
    societeId: string;
    role: string;
    permissions?: Record<string, string>;
    fullAccess?: boolean;
  },
): Promise<boolean> {
  if (acteur.fullAccess || estContresignataire(acteur)) return true;
  if (!ROLES_DELEGATAIRES.has(acteur.role)) return false;
  return (await delegataireCeo(prisma, acteur.societeId)) === acteur.userId;
}

// Titulaire de la contresignature (hors carte blanche) : il ne valide QUE
// les affaires au-delà du seuil (cf. SeuilCeoService).
export const estContresignataire = (a: { permissions?: Record<string, string>; fullAccess?: boolean }) =>
  !a.fullAccess && hasRight(a.permissions, ETAPE.financesContresignature, 'validation');
