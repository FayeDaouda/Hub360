import type { NiveauPermission, Session } from './types';

const STORAGE_KEY = 'hub_session';

// "Se souvenir de moi" coché -> localStorage (survit à la fermeture du
// navigateur). Décoché -> sessionStorage (effacé à la fermeture de l'onglet).
export function saveSession(session: Session, remember: boolean) {
  const raw = JSON.stringify(session);
  if (remember) {
    localStorage.setItem(STORAGE_KEY, raw);
    sessionStorage.removeItem(STORAGE_KEY);
  } else {
    sessionStorage.setItem(STORAGE_KEY, raw);
    localStorage.removeItem(STORAGE_KEY);
  }
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
// ex. après un changement de mot de passe qui a renouvelé le jeton.
export function remplacerSession(session: Session) {
  saveSession(session, localStorage.getItem(STORAGE_KEY) !== null);
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

const ORDRE_NIVEAUX: Record<NiveauPermission, number> = {
  aucun: 0,
  lecture: 1,
  ecriture: 2,
  validation: 3,
};

// Affichage seulement (montrer/masquer, rediriger) : le serveur revérifie
// chaque requête. Même règle que backend/src/commun/permission.guard.ts.
export function niveauSuffisant(session: Session | null, module: string, niveau: NiveauPermission): boolean {
  const actuel = session?.permissions?.[module] ?? 'aucun';
  return ORDRE_NIVEAUX[actuel] >= ORDRE_NIVEAUX[niveau];
}

// Raccourci sur la session courante.
export function aLaPermission(module: string, niveau: NiveauPermission): boolean {
  return niveauSuffisant(getSession(), module, niveau);
}
