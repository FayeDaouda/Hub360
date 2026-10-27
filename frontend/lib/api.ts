import { Session, Societe, SocietePortail } from './types';

// Navigateur : NEXT_PUBLIC_API_URL (« /api » derrière Caddy en production).
// Serveur Next (portail, page de connexion) : une URL relative n'a pas de
// sens côté serveur — API_INTERNE_URL (ex. http://backend:3001/api entre
// conteneurs), lue à l'exécution.
const API_URL =
  (typeof window === 'undefined' && process.env.API_INTERNE_URL) ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001/api';

export async function getSocietes(): Promise<SocietePortail[]> {
  const res = await fetch(`${API_URL}/societes`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Impossible de charger les sociétés');
  return res.json();
}

// null si la société n'existe pas ou n'est pas active — utilisé par la page
// de login pour afficher une 404 plutôt qu'un écran cassé
export async function getSociete(slug: string): Promise<Societe | null> {
  const res = await fetch(`${API_URL}/societes/${slug}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Impossible de charger la société');
  return res.json();
}

// Motif d'échec distinct par cause réelle : avant, tout échec s'affichait
// « identifiants incorrects » — y compris le blocage anti-bruteforce du
// backend (429, 5 essais/min) ou un serveur injoignable, ce qui poussait à
// retaper un mot de passe pourtant juste. Les 401 restent volontairement
// indistincts (anti-énumération, cf. AuthService.login). Compte verrouillé
// après trop d'essais (423, lot C) : le serveur donne l'heure de fin.
export type MotifEchecConnexion = 'identifiants' | 'trop_de_tentatives' | 'verrouille' | 'reseau' | 'serveur';

export class EchecConnexion extends Error {
  readonly motif: MotifEchecConnexion;
  // Texte du serveur, quand il en dit plus que le motif (heure de fin du
  // verrouillage).
  readonly detail?: string;

  constructor(motif: MotifEchecConnexion, detail?: string) {
    super(`Échec de connexion (${motif})`);
    this.name = 'EchecConnexion';
    this.motif = motif;
    this.detail = detail;
  }
}

// Mot de passe juste mais double authentification à passer : le serveur
// rend une étape (code de l'application, ou première activation) et un jeton
// valable 10 minutes, pas encore de session.
export type EtapeConnexion = { etape: 'code' | 'enrolement'; jeton: string };
export const estEtape = (r: Session | EtapeConnexion): r is EtapeConnexion => 'etape' in r;

export async function login(email: string, motDePasse: string, societeSlug: string): Promise<Session | EtapeConnexion> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, motDePasse, societeSlug }),
    });
  } catch {
    throw new EchecConnexion('reseau');
  }
  if (res.ok) return res.json();
  if (res.status === 429) throw new EchecConnexion('trop_de_tentatives');
  if (res.status === 423) {
    const corps = await res.json().catch(() => null);
    throw new EchecConnexion('verrouille', typeof corps?.message === 'string' ? corps.message : undefined);
  }
  if (res.status >= 500) throw new EchecConnexion('serveur');
  throw new EchecConnexion('identifiants');
}

// -- Double authentification (routes /auth/login/code, /auth/double-facteur/*) --

async function postDoubleFacteur<T>(chemin: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Serveur injoignable. Vérifiez votre connexion internet puis réessayez.');
  }
  if (res.ok) return res.json();
  if (res.status === 429) throw new Error('Trop de tentatives. Patientez une minute avant de réessayer.');
  const c = await res.json().catch(() => null);
  throw new Error(typeof c?.message === 'string' ? c.message : 'Code incorrect.');
}

export const connexionAvecCode = (jeton: string, code: string) =>
  postDoubleFacteur<Session>('login/code', { jeton, code });
export const preparerDoubleFacteur = (jeton: string) =>
  postDoubleFacteur<{ secret: string; qr: string }>('double-facteur/preparation', { jeton });
export const activerDoubleFacteur = (jeton: string, code: string) =>
  postDoubleFacteur<Session & { codesSecours: string[] }>('double-facteur/activation', { jeton, code });

// -- Comptes : activation, reset, mot de passe oublié (routes /auth/*) --------

async function postAuth<T>(chemin: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/auth/${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = 'Une erreur est survenue.';
    try {
      const c = await res.json();
      if (Array.isArray(c?.message)) message = c.message.join(' · ');
      else if (typeof c?.message === 'string') message = c.message;
    } catch {
      /* corps non-JSON */
    }
    throw new Error(message);
  }
  return res.json().catch(() => ({}) as T);
}

export function activerCompte(token: string, motDePasse: string) {
  return postAuth<{ ok: true }>('activation', { token, motDePasse });
}

export function reinitialiserMotDePasse(token: string, motDePasse: string) {
  return postAuth<{ ok: true }>('reinitialisation', { token, motDePasse });
}

export function motDePasseOublie(email: string) {
  return postAuth<{ message: string }>('mot-de-passe-oublie', { email });
}
