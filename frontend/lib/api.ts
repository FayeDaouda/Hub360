import { Session, Societe } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export async function getSocietes(): Promise<Societe[]> {
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
// indistincts (anti-énumération, cf. AuthService.login).
export type MotifEchecConnexion = 'identifiants' | 'trop_de_tentatives' | 'reseau' | 'serveur';

export class EchecConnexion extends Error {
  readonly motif: MotifEchecConnexion;

  constructor(motif: MotifEchecConnexion) {
    super(`Échec de connexion (${motif})`);
    this.name = 'EchecConnexion';
    this.motif = motif;
  }
}

export async function login(
  email: string,
  motDePasse: string,
  societeSlug: string,
): Promise<Session> {
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
  if (res.status >= 500) throw new EchecConnexion('serveur');
  throw new EchecConnexion('identifiants');
}

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
