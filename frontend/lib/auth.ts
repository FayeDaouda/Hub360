import { Session } from './types';

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

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}
