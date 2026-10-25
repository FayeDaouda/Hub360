import { RelanceDevisEmail } from './email.service';

// Contenu de l'email de relance d'une offre (étape F). Pur (aucune I/O) —
// même motif que contenu-devis.ts, dont il reprend le lien de réponse en
// ligne : c'est un NOUVEAU lien (jeton régénéré), l'ancien ne marche plus.
export function contenuRelanceDevis(r: RelanceDevisEmail): { sujet: string; texte: string; html: string } {
  const marque = process.env.MAIL_MARQUE || 'hub360°';
  const ref = r.reference ?? '';
  const montant = formatMontant(r.montantTtc);
  const validite = r.dateValidite ? formatDate(r.dateValidite) : null;

  const sujet = `Rappel — Devis ${ref} en attente de votre réponse`;
  const intro = validite
    ? `Nous revenons vers vous au sujet du devis ${ref} (${montant} TTC) que nous vous avons transmis. Il reste valable jusqu'au ${validite} : vous pouvez l'accepter ou le refuser directement en ligne.`
    : `Nous revenons vers vous au sujet du devis ${ref} (${montant} TTC) que nous vous avons transmis : vous pouvez l'accepter ou le refuser directement en ligne.`;
  const pied = `Ce lien remplace le précédent et vous est personnel — ne le transmettez pas. Généré via ${marque}.`;

  const texte = [`Bonjour ${r.clientNom},`, '', intro, '', r.lien, '', pied, '', r.societeNom].join('\n');

  const html = [
    `<p>Bonjour ${echapper(r.clientNom)},</p>`,
    `<p>${echapper(intro)}</p>`,
    `<p><a href="${echapper(r.lien)}">Consulter le devis ${echapper(ref)}</a></p>`,
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
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
