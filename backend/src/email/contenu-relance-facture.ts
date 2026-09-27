import { RelanceFactureEmail } from './email.service';

// Contenu de l'email de relance manuelle. Pur (aucune I/O) — même motif que
// contenu-lien-compte.ts / contenu-devis.ts. Pas de lien (pas de page
// publique de facture) : juste un rappel courtois du montant et du retard.
export function contenuRelanceFacture(
  r: RelanceFactureEmail,
): { sujet: string; texte: string; html: string } {
  const ref = r.reference ?? '';
  const montant = formatMontant(r.resteAPayer);
  const echeance = r.echeanceLe ? formatDate(r.echeanceLe) : null;
  const retard = `${r.joursRetard} jour${r.joursRetard > 1 ? 's' : ''}`;

  const sujet = `Rappel — Facture ${ref} en attente de règlement`;
  const intro = echeance
    ? `Nous vous rappelons que la facture ${ref} d'un montant de ${montant} restant dû, échue le ${echeance}, est en attente de règlement depuis ${retard}.`
    : `Nous vous rappelons que la facture ${ref} d'un montant de ${montant} restant dû est en attente de règlement.`;
  const pied = `Si ce règlement a déjà été effectué, merci de ne pas tenir compte de ce message. Pour toute question, contactez-nous directement.`;

  const texte = [`Bonjour ${r.clientNom},`, '', intro, '', pied, '', r.societeNom].join('\n');

  const html = [
    `<p>Bonjour ${echapper(r.clientNom)},</p>`,
    `<p>${echapper(intro)}</p>`,
    `<p style="color:#6c6960;font-size:13px">${echapper(pied)}</p>`,
    `<p>${echapper(r.societeNom)}</p>`,
  ].join('');

  return { sujet, texte, html };
}

function formatMontant(valeur: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(valeur))} FCFA`;
}

function formatDate(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function echapper(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
