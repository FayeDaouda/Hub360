import { DevisEmail } from './email.service';
import { formatAmount } from '../shared/format';
import { escapeHtml } from '../shared/text';

// Contenu de l'email de notification devis. Pur (aucune I/O) — même motif que
// contenu-lien-compte.ts : partagé par les transports, facile à tester.
export function contenuDevis(d: DevisEmail): { sujet: string; texte: string; html: string } {
  const marque = process.env.MAIL_MARQUE || 'hub360°';
  const montant = formatAmount(d.montantTtc);
  const ref = d.reference ?? '';

  const sujet = `Devis ${ref} — ${d.societeNom}`;
  const intro = `${d.societeNom} vous a transmis un devis (${montant} TTC). Consultez-le et répondez directement en ligne — vous pouvez l'accepter ou le refuser depuis la page, sans créer de compte.`;
  const pied = `Ce lien est personnel — ne le transmettez pas. Généré via ${marque}.`;

  const texte = [`Bonjour ${d.clientNom},`, '', intro, '', d.lien, '', pied].join('\n');

  const html = [
    `<p>Bonjour ${escapeHtml(d.clientNom)},</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    `<p><a href="${escapeHtml(d.lien)}">Consulter le devis ${escapeHtml(ref)}</a></p>`,
    `<p style="color:#6c6960;font-size:13px">${escapeHtml(pied)}</p>`,
  ].join('');

  return { sujet, texte, html };
}
