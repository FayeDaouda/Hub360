import { LienCompte } from './email.service';
import { escapeHtml } from '../shared/text';

// Contenu des deux emails de compte. Pur (aucune I/O) — partagé par les
// transports et facile à tester. FR, ton sobre, une seule action.
export function contenuLienCompte(l: LienCompte): {
  sujet: string;
  texte: string;
  html: string;
} {
  const marque = process.env.MAIL_MARQUE || 'hub360°';
  const invitation = l.type === 'invitation';

  const sujet = invitation ? `Activez votre accès ${marque}` : `Réinitialisation de votre mot de passe ${marque}`;

  const intro = invitation
    ? `Un accès ${marque} vient d'être créé pour vous. Cliquez sur le lien ci-dessous pour choisir votre mot de passe et activer votre compte.`
    : `Vous avez demandé à réinitialiser votre mot de passe ${marque}. Cliquez sur le lien ci-dessous pour en choisir un nouveau.`;

  const validite = invitation ? '72 heures' : '1 heure';
  const pied = `Ce lien est valable ${validite} et à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`;

  const texte = [`Bonjour ${l.prenom},`, '', intro, '', l.lien, '', pied].join('\n');

  const html = [
    `<p>Bonjour ${escapeHtml(l.prenom)},</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    `<p><a href="${escapeHtml(l.lien)}">${invitation ? 'Activer mon compte' : 'Choisir un nouveau mot de passe'}</a></p>`,
    `<p style="color:#6c6960;font-size:13px">${escapeHtml(pied)}</p>`,
  ].join('');

  return { sujet, texte, html };
}
