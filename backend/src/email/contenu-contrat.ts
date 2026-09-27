import { ContratEmail } from './email.service';

// Contenu de l'email d'envoi d'un contrat à signer (étape G). Pur (aucune
// I/O) — même motif que contenu-devis.ts.
export function contenuContrat(c: ContratEmail): { sujet: string; texte: string; html: string } {
  const marque = process.env.MAIL_MARQUE || 'hub360°';
  const sujet = `Contrat à signer — ${c.codeDossier} — ${c.societeNom}`;
  const intro = `${c.societeNom} vous transmet le contrat relatif à votre projet (${c.codeDossier}), accompagné de ses annexes. Vous pouvez le consulter et le signer directement en ligne, sans créer de compte.`;
  const pied = `Ce lien est personnel — ne le transmettez pas. Généré via ${marque}.`;

  const texte = [`Bonjour ${c.clientNom},`, '', intro, '', c.lien, '', pied].join('\n');
  const html = [
    `<p>Bonjour ${echapper(c.clientNom)},</p>`,
    `<p>${echapper(intro)}</p>`,
    `<p><a href="${echapper(c.lien)}">Consulter et signer le contrat</a></p>`,
    `<p style="color:#6c6960;font-size:13px">${echapper(pied)}</p>`,
  ].join('');
  return { sujet, texte, html };
}

function echapper(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
