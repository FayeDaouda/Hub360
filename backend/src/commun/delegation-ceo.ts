import type { PrismaService } from '../prisma/prisma.service';

// Délégation du CEO (revue CEO, 22/10/2026) — lecture commune à tous les
// modules (fonction, pas de service : aucun cycle de modules). Délégués :
// avoirs au-delà du seuil, arbitrage des décisions proposées, absences des
// directeurs (N+1 CEO) — dans la limite des droits du délégataire, jamais
// sur sa propre demande. Jamais délégués : droits du CIO, salaire du CFO.
export const ROLE_CEO = 'CEO (transverse)';
export const ROLES_DELEGATAIRES: ReadonlySet<string> = new Set(['CTO (transverse)', 'CFO']);

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Compte du délégataire en fonction ce jour-là, ou null.
export async function delegataireCeo(
  prisma: PrismaService,
  societeId: string,
  jour = aujourdhui(),
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
