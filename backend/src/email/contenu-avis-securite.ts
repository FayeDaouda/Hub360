import { escapeHtml, formatLongDateTime } from '@hub/domain';
import { AvisSecurite } from './email.service';

const EVENEMENTS: Record<AvisSecurite['evenement'], { sujet: string; phrase: string }> = {
  mot_de_passe_modifie: {
    sujet: 'Votre mot de passe a été modifié',
    phrase: 'Le mot de passe de votre compte {marque} a été modifié',
  },
  mot_de_passe_reinitialise: {
    sujet: 'Votre mot de passe a été réinitialisé',
    phrase: 'Le mot de passe de votre compte {marque} a été réinitialisé avec un lien envoyé à cette adresse',
  },
  double_facteur_active: {
    sujet: 'Double authentification activée',
    phrase: 'La double authentification a été activée sur votre compte {marque}',
  },
  double_facteur_reinitialise: {
    sujet: 'Double authentification réinitialisée',
    phrase:
      'La double authentification de votre compte {marque} a été réinitialisée par l’administration du HUB ; vous la réactiverez à votre prochaine connexion',
  },
};

// Avis de sécurité : la personne est prévenue de chaque changement sensible
// sur son compte, et sait quoi faire si ce n'est pas elle. Pur (aucune I/O),
// comme les autres contenus d'e-mail. Heure de Dakar (glossaire).
export function contenuAvisSecurite(a: AvisSecurite): { sujet: string; texte: string; html: string } {
  const marque = process.env.MAIL_MARQUE || 'hub360°';
  const evenement = EVENEMENTS[a.evenement];
  const sujet = `${evenement.sujet} · ${marque}`;
  const constat = `${evenement.phrase.replace('{marque}', marque)} le ${formatLongDateTime(a.le.toISOString())} (heure de Dakar).`;
  const conduite =
    'Si c’est bien vous, il n’y a rien à faire. Sinon, réinitialisez tout de suite votre mot de passe (« Mot de passe oublié » sur la page de connexion) et prévenez l’administration du HUB.';
  const texte = [`Bonjour ${a.prenom},`, '', constat, '', conduite].join('\n');
  const html = [
    `<p>Bonjour ${escapeHtml(a.prenom)},</p>`,
    `<p>${escapeHtml(constat)}</p>`,
    `<p>${escapeHtml(conduite)}</p>`,
  ].join('');
  return { sujet, texte, html };
}
