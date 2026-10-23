import { clearSession, getSession } from './auth';

// Base de l'API NestJS. Override possible via NEXT_PUBLIC_API_URL.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Adresse absolue d'une ressource de l'API (ex. une photo de profil
// « /photos/<clé> », lue par une balise <img>).
export const urlApi = (chemin: string) => `${API_URL}${chemin}`;

// Erreur normalisée : `message` reprend le message métier renvoyé par NestJS
// (les gardes 409, la validation 400…) pour que les `catch` existants des
// pages — `e instanceof Error ? e.message : …` — l'affichent tel quel.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  // true pour les endpoints qui répondent 200/201 sans corps (soft-delete…).
  sansCorps?: boolean;
};

// Appel authentifié à une route sous /api/societes/:slug.
// `chemin` commence par « / » — ex. apiSociete(slug, `/projets-ouverts/${id}`).
export function apiSociete<T>(slug: string, chemin: string, options: Options = {}): Promise<T> {
  return apiAuth<T>(`/societes/${slug}${chemin}`, options);
}

// Appel authentifié à n'importe quelle route de l'API (ex. /groupe/comptes
// pour l'admin du groupe, hors de toute société). `chemin` commence par « / ».
export async function apiAuth<T>(chemin: string, options: Options = {}): Promise<T> {
  const session = getSession();
  const aCorps = options.body !== undefined;

  const res = await fetch(`${API_URL}${chemin}`, {
    method: options.method ?? 'GET',
    cache: 'no-store',
    headers: {
      ...(aCorps ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: aCorps ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const message = await messageErreur(res);
    // Jeton refusé par le garde (session coupée : « se déconnecter de tous les
    // appareils », mot de passe réinitialisé, compte désactivé) : la session
    // locale est effacée et l'on revient à l'écran de connexion de la société.
    // Un 401 métier (code de double authentification erroné…) porte son propre
    // message et reste une erreur ordinaire.
    // Messages du garde (backend jwt.strategy) : « Unauthorized », ou « …
    // reconnecte-toi. » (session invalide, expirée, société introuvable).
    const sessionRefusee = message === 'Unauthorized' || /reconnecte-toi\.?$/.test(message);
    if (res.status === 401 && session && sessionRefusee && typeof window !== 'undefined') {
      clearSession();
      window.location.assign(`/login/${session.societe.slug}?session=expiree`);
    }
    throw new ApiError(message, res.status);
  }
  if (options.sansCorps || res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// Appel SANS authentification à une route publique (racine, pas sous
// /societes/:slug) — ex. le lien devis-public par jeton. Jamais de session
// attachée : le jeton de l'URL en tient lieu côté serveur.
export async function apiPublic<T>(chemin: string, options: Options = {}): Promise<T> {
  const aCorps = options.body !== undefined;
  const res = await fetch(`${API_URL}${chemin}`, {
    method: options.method ?? 'GET',
    cache: 'no-store',
    headers: aCorps ? { 'Content-Type': 'application/json' } : {},
    body: aCorps ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    throw new ApiError(await messageErreur(res), res.status);
  }
  if (options.sansCorps || res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

async function messageErreur(res: Response): Promise<string> {
  try {
    const corps = await res.json();
    const m = corps?.message;
    if (Array.isArray(m)) return m.join(' · ');
    if (typeof m === 'string') return m;
  } catch {
    /* corps vide ou non-JSON */
  }
  return `Erreur ${res.status}`;
}
