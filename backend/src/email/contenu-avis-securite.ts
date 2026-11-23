import { escapeHtml, formatLongDateTime } from '@hub/domain';
import { ESSAIS_AVANT_VERROUILLAGE } from '../auth/verrouillage';
import { AvisSecurite } from './email.service';

const CONDUITE =
  'Si c’est bien vous, il n’y a rien à faire. Sinon, réinitialisez tout de suite votre mot de passe (« Mot de passe oublié » sur la page de connexion) et prévenez l’administration du HUB.';

const EVENEMENTS: Record<AvisSecurite['evenement'], { sujet: string; phrase: string; conduite?: string }> = {
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
  // Synchronisation de l'Agenda (16/11/2026) : un compte Google relié.
  agenda_connecte: {
    sujet: 'Google Agenda connecté à votre compte',
    phrase: 'Un compte Google Agenda{detail} a été connecté à votre Agenda {marque}',
    conduite:
      'Si c’est bien vous, il n’y a rien à faire. Sinon, déconnectez-le dans « Agendas connectés » de l’Agenda, faites « Déconnecter partout » dans votre compte et prévenez l’administration du HUB.',
  },
  compte_verrouille: {
    sujet: 'Votre compte est verrouillé',
    phrase: `Après ${ESSAIS_AVANT_VERROUILLAGE} essais de connexion infructueux, votre compte {marque} a été verrouillé`,
    conduite:
      'Si c’est bien vous, patientez jusque-là ou demandez au CIO de le débloquer. Sinon, quelqu’un a essayé d’entrer avec votre adresse : prévenez l’administration du HUB et changez votre mot de passe (« Mot de passe oublié » sur la page de connexion).',
  },
};

// Avis de sécurité : la personne est prévenue de chaque changement sensible
// sur son compte, et sait quoi faire si ce n'est pas elle. Pur (aucune I/O),
// comme les autres contenus d'e-mail. Heure de Dakar (glossaire).
export function contenuAvisSecurite(a: AvisSecurite): { sujet: string; texte: string; html: string } {
  const marque = process.env.MAIL_MARQUE || 'hub360°';
  const evenement = EVENEMENTS[a.evenement];
  const sujet = `${evenement.sujet} · ${marque}`;
  const fin = a.jusquau ? ` Il rouvrira le ${formatLongDateTime(a.jusquau.toISOString())}.` : '';
  const phrase = evenement.phrase.replace('{marque}', marque).replace('{detail}', a.detail ? ` (${a.detail})` : '');
  const constat = `${phrase} le ${formatLongDateTime(a.le.toISOString())} (heure de Dakar).${fin}`;
  const conduite = evenement.conduite ?? CONDUITE;
  const texte = [`Bonjour ${a.prenom},`, '', constat, '', conduite].join('\n');
  const html = [
    `<p>Bonjour ${escapeHtml(a.prenom)},</p>`,
    `<p>${escapeHtml(constat)}</p>`,
    `<p>${escapeHtml(conduite)}</p>`,
  ].join('');
  return { sujet, texte, html };
}
