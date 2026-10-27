import { RelanceFactureEmail } from './email.service';
import { escapeHtml, formatAmount, formatLongDate, plural } from '@hub/domain';

// Contenu de l'email de relance manuelle. Pur (aucune I/O) — même motif que
// contenu-lien-compte.ts / contenu-devis.ts. Pas de lien (pas de page
// publique de facture) : juste un rappel courtois du montant et du retard.
export function contenuRelanceFacture(r: RelanceFactureEmail): { sujet: string; texte: string; html: string } {
  const ref = r.reference ?? '';
  const montant = formatAmount(r.resteAPayer);
  const echeance = r.echeanceLe ? formatLongDate(r.echeanceLe) : null;
  const retard = `${plural(r.joursRetard, 'jour')}`;

  const sujet = `Rappel — Facture ${ref} en attente de règlement`;
  const intro = echeance
    ? `Nous vous rappelons que la facture ${ref} d'un montant de ${montant} restant dû, échue le ${echeance}, est en attente de règlement depuis ${retard}.`
    : `Nous vous rappelons que la facture ${ref} d'un montant de ${montant} restant dû est en attente de règlement.`;
  const pied = `Si ce règlement a déjà été effectué, merci de ne pas tenir compte de ce message. Pour toute question, contactez-nous directement.`;

  const texte = [`Bonjour ${r.clientNom},`, '', intro, '', pied, '', r.societeNom].join('\n');

  const html = [
    `<p>Bonjour ${escapeHtml(r.clientNom)},</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    `<p style="color:#6c6960;font-size:13px">${escapeHtml(pied)}</p>`,
    `<p>${escapeHtml(r.societeNom)}</p>`,
  ].join('');

  return { sujet, texte, html };
}
