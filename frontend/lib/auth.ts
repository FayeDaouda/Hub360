import { hasRight, type Right } from '@hub/domain';
import type { Session } from './types';

const STORAGE_KEY = 'hub_session';

// Émis à chaque enregistrement de la session (prolongation, droits relus,
// nom affiché) : les coquilles (admin, /groupe) se remettent à jour sans
// rechargement — menus et boutons suivent les droits du moment.
export const SESSION_EVENT = 'hub:session';

// "Se souvenir de moi" coché -> localStorage (survit à la fermeture du
// navigateur). Décoché -> sessionStorage (effacé à la fermeture de l'onglet).
// recuLe : heure du poste à la réception du jeton, gardée tant que le jeton
// ne change pas (échéance de la session, components/session-keeper.tsx).
export function saveSession(session: Session, remember: boolean) {
  const actuelle = getSession();
  const recuLe = actuelle?.access_token === session.access_token ? actuelle.recuLe : Date.now();
  const raw = JSON.stringify({ ...session, recuLe });
  if (remember) {
    localStorage.setItem(STORAGE_KEY, raw);
    sessionStorage.removeItem(STORAGE_KEY);
  } else {
    sessionStorage.setItem(STORAGE_KEY, raw);
    localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

// Remplace la session en place (même stockage : « rester connecté » ou non),
// ex. après un changement de mot de passe qui a renouvelé le jeton. Pour le
// même compte, le jeton enregistré n'est jamais remplacé par un plus ancien :
// un écran peut repasser sa copie de la session, prise avant une
// prolongation (lot B).
export function remplacerSession(session: Session) {
  const actuelle = getSession();
  const memeCompte = actuelle?.utilisateur.id === session.utilisateur.id && actuelle.societe.id === session.societe.id;
  const jeton =
    actuelle && memeCompte && emission(actuelle.access_token) > emission(session.access_token)
      ? actuelle.access_token
      : session.access_token;
  saveSession({ ...session, access_token: jeton }, localStorage.getItem(STORAGE_KEY) !== null);
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

// Session refusée par l'API ou échue : effacée, retour à l'écran de connexion
// de la société, qui dit pourquoi.
export function retourConnexion(slug: string) {
  clearSession();
  window.location.assign(`/login/${slug}?session=expiree`);
}

// Dates du jeton de session (secondes, horloge du serveur), lues sans vérifier
// la signature : minuterie d'affichage seulement, le serveur reste seul juge.
export function datesJeton(jeton: string): { iat: number; exp: number } | null {
  try {
    const contenu = JSON.parse(atob(jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof contenu.iat === 'number' && typeof contenu.exp === 'number'
      ? { iat: contenu.iat, exp: contenu.exp }
      : null;
  } catch {
    return null;
  }
}

const emission = (jeton: string) => datesJeton(jeton)?.iat ?? 0;

// Affichage seulement (montrer/masquer, rediriger) : le serveur revérifie
// chaque requête. Même règle que backend/src/commun/permission.guard.ts :
// quatre droits indépendants (31/10/2026), la validation ne donne pas
// l'écriture.
export function niveauSuffisant(session: Session | null, module: string, niveau: Right | 'aucun'): boolean {
  return hasRight(session?.permissions as Record<string, string> | undefined, module, niveau);
}

// Raccourci sur la session courante.
export function aLaPermission(module: string, niveau: Right | 'aucun'): boolean {
  return niveauSuffisant(getSession(), module, niveau);
}
