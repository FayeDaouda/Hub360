import { getSession } from './auth';

// Base de l'API NestJS. Override possible via NEXT_PUBLIC_API_URL.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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
// `chemin` commence par « / » — ex. apiSociete(slug, `/projets/${id}/permis`).
export async function apiSociete<T>(
  slug: string,
  chemin: string,
  options: Options = {},
): Promise<T> {
  const session = getSession();
  const aCorps = options.body !== undefined;

  const res = await fetch(`${API_URL}/societes/${slug}${chemin}`, {
    method: options.method ?? 'GET',
    cache: 'no-store',
    headers: {
      ...(aCorps ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
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
