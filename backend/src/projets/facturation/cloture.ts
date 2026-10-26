import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { formatMonthYear } from '../../shared/dates';

// Clôture mensuelle (revue CFO validée 20/10/2026) — lecture de l'état.

// Mois clos de la société : ceux dont le dernier événement est une clôture.
export async function moisClos(prisma: PrismaService, societeId: string): Promise<Set<string>> {
  const evenements = await prisma.journalCloture.findMany({
    where: { societeId },
    orderBy: { createdAt: 'asc' },
    select: { mois: true, action: true },
  });
  const etat = new Map<string, boolean>();
  for (const e of evenements) etat.set(e.mois, e.action === 'cloture');
  return new Set([...etat].filter(([, clos]) => clos).map(([m]) => m));
}

// Refuse toute écriture datée d'un mois clos (paiement ajouté ou supprimé).
export async function exigerMoisOuvert(prisma: PrismaService, societeId: string, date: string, quoi: string) {
  const mois = date.slice(0, 7);
  if ((await moisClos(prisma, societeId)).has(mois)) {
    throw new ConflictException(
      `${formatMonthYear(mois)} est clôturé : ${quoi} n'est plus possible. Corrigez par un avoir ou une écriture datée du mois en cours.`,
    );
  }
}
