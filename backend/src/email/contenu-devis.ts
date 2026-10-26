import { DevisEmail } from './email.service';

// Contenu de l'email de notification devis. Pur (aucune I/O) — même motif que
// contenu-lien-compte.ts : partagé par les transports, facile à tester.
export function contenuDevis(d: DevisEmail): { sujet: string; texte: string; html: string } {
  const marque = process.env.MAIL_MARQUE || 'hub360°';
  const montant = formatMontant(d.montantTtc);
  const ref = d.reference ?? '';

  const sujet = `Devis ${ref} — ${d.societeNom}`;
  const intro = `${d.societeNom} vous a transmis un devis (${montant} TTC). Consultez-le et répondez directement en ligne — vous pouvez l'accepter ou le refuser depuis la page, sans créer de compte.`;
  const pied = `Ce lien est personnel — ne le transmettez pas. Généré via ${marque}.`;

  const texte = [`Bonjour ${d.clientNom},`, '', intro, '', d.lien, '', pied].join('\n');

  const html = [
    `<p>Bonjour ${echapper(d.clientNom)},</p>`,
    `<p>${echapper(intro)}</p>`,
    `<p><a href="${echapper(d.lien)}">Consulter le devis ${echapper(ref)}</a></p>`,
    `<p style="color:#6c6960;font-size:13px">${echapper(pied)}</p>`,
  ].join('');

  return { sujet, texte, html };
}

function formatMontant(valeur: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(valeur))} FCFA`;
}

function echapper(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
