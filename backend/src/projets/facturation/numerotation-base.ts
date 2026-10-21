import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { formaterNumero, formatParDefaut, prochaineSequence, type FormatAnnee, type FormatNumero } from './numerotation';

type Client = PrismaService | Prisma.TransactionClient;

// Format de numérotation en vigueur : le dernier réglage du CFO, sinon le
// format par défaut (initiales de la société).
export async function formatEnVigueur(db: Client, societeId: string): Promise<FormatNumero> {
  const l = await db.numerotationFactures.findFirst({ where: { societeId }, orderBy: { createdAt: 'desc' } });
  if (l) return { prefixe: l.prefixe, formatAnnee: l.formatAnnee as FormatAnnee, separateur: l.separateur, chiffres: l.chiffres, numeroDepart: l.numeroDepart };
  const s = await db.societe.findUniqueOrThrow({ where: { id: societeId }, select: { nom: true } });
  return formatParDefaut(s.nom);
}

// Prochain numéro légal : séquence (préfixe, année en cours), le plus grand
// émis + 1 ou le numéro de départ. Appelé dans la transaction d'émission ;
// la contrainte unique (société, préfixe, année, séquence) exclut le doublon.
export async function prochainNumeroLegal(db: Client, societeId: string) {
  const format = await formatEnVigueur(db, societeId);
  const annee = new Date().getUTCFullYear();
  const dernier = await db.facture.aggregate({ where: { societeId, refPrefixe: format.prefixe, refAnnee: annee }, _max: { refSequence: true } });
  const sequence = prochaineSequence(dernier._max.refSequence ?? null, format.numeroDepart);
  return { reference: formaterNumero(format, annee, sequence), refPrefixe: format.prefixe, refAnnee: annee, refSequence: sequence };
}
