import { createHash, randomBytes } from 'crypto';

// Client Google Agenda (16/11/2026) : OAuth 2.0 (code d'autorisation + PKCE,
// accès hors ligne) et API Calendar v3, en appels HTTP directs (pas de
// bibliothèque `googleapis`). `fetch` est injectable : les tests ne parlent
// jamais à Google.

const AUTORISATION = 'https://accounts.google.com/o/oauth2/v2/auth';
const JETON = 'https://oauth2.googleapis.com/token';
const REVOCATION = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3';
// Délai maximal d'un appel (Google qui ne répond plus ne bloque pas la tournée).
const DELAI_MS = 20_000;
// Volume lu par agenda et par tournée : au-delà, la lecture est refusée
// plutôt que tronquée en silence (une liste tronquée ferait croire à des
// suppressions). Borné en éléments (Google rend parfois des pages courtes)
// et, par sûreté, en pages.
const ELEMENTS_MAX = 5_000;
const PAGES_MAX = 50;

// Ce que le HUB demande : l'adresse du compte, la liste de ses agendas, et
// lire / écrire leurs événements (rien d'autre : ni e-mails, ni contacts).
export const PORTEES_GOOGLE = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

export class ErreurGoogle extends Error {
  constructor(
    readonly statut: number,
    message: string,
    // L'accès n'est plus valable (révoqué chez Google, mot de passe changé) :
    // la personne doit reconnecter son compte.
    readonly accesRevoque = false,
  ) {
    super(message);
  }
}

export type AgendaGoogle = {
  id: string;
  nom: string;
  couleur: string | null;
  principal: boolean;
  ecriture: boolean;
  proprietaire: boolean; // seul possible comme cible (jamais un agenda partagé)
};

export type EvenementGoogle = {
  id: string;
  iCalUID?: string;
  status?: string; // « cancelled » : supprimé
  summary?: string;
  location?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

export type EcritureGoogle = {
  summary: string;
  location?: string | null;
  description?: string | null;
  // `date: null` : repasse une journée entière en horaire (modification).
  start: { dateTime: string; date?: null };
  end: { dateTime: string; date?: null };
  extendedProperties?: { private: Record<string, string> };
};

// Vérificateur et défi PKCE (RFC 7636, S256).
export function pkce(): { verificateur: string; defi: string } {
  const verificateur = randomBytes(32).toString('base64url');
  return { verificateur, defi: createHash('sha256').update(verificateur).digest('base64url') };
}

export class ClientGoogle {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  configure(): boolean {
    return !!this.env.GOOGLE_CLIENT_ID && !!this.env.GOOGLE_CLIENT_SECRET;
  }

  urlAutorisation(etat: string, defi: string, redirection: string): string {
    const p = new URLSearchParams({
      client_id: this.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: redirection,
      response_type: 'code',
      scope: PORTEES_GOOGLE.join(' '),
      access_type: 'offline', // un jeton de rafraîchissement
      prompt: 'consent', // toujours redonné, même à une reconnexion
      include_granted_scopes: 'true',
      state: etat,
      code_challenge: defi,
      code_challenge_method: 'S256',
    });
    return `${AUTORISATION}?${p.toString()}`;
  }

  // Code reçu au retour → jeton de rafraîchissement et adresse du compte.
  async echangerCode(
    code: string,
    verificateur: string,
    redirection: string,
  ): Promise<{ rafraichissement: string; compte: string; sujet: string }> {
    const r = await this.formulaire(JETON, {
      code,
      code_verifier: verificateur,
      client_id: this.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: this.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirection,
      grant_type: 'authorization_code',
    });
    if (!r.refresh_token)
      throw new ErreurGoogle(400, 'Google n’a pas donné d’accès hors ligne : reconnectez le compte.');
    // L'identité stable du compte (« sub ») : l'adresse peut changer.
    const { compte, sujet } = identiteDuJeton(String(r.id_token ?? ''));
    if (!sujet) throw new ErreurGoogle(400, 'Google n’a pas donné l’identité du compte : reconnectez-le.');
    return { rafraichissement: String(r.refresh_token), compte, sujet };
  }

  // Jeton d'accès (une heure) à partir du jeton de rafraîchissement.
  async acces(rafraichissement: string): Promise<string> {
    const r = await this.formulaire(JETON, {
      refresh_token: rafraichissement,
      client_id: this.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: this.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    });
    return String(r.access_token);
  }

  async revoquer(jeton: string): Promise<void> {
    // Le jeton dans le corps, jamais dans l'adresse ; sans effet si déjà
    // révoqué : on n'en fait pas une erreur.
    await this.fetchFn(REVOCATION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: jeton }).toString(),
      signal: AbortSignal.timeout(DELAI_MS),
    }).catch(() => undefined);
  }

  async agendas(acces: string): Promise<AgendaGoogle[]> {
    const items = await this.pages<{
      id: string;
      summary?: string;
      summaryOverride?: string;
      backgroundColor?: string;
      primary?: boolean;
      accessRole?: string;
    }>(acces, `${API}/users/me/calendarList?minAccessRole=reader`, 'Trop d’agendas dans ce compte Google.');
    return items.map((c) => ({
      id: c.id,
      nom: c.summaryOverride || c.summary || c.id,
      couleur: c.backgroundColor ?? null,
      principal: !!c.primary,
      ecriture: c.accessRole === 'owner' || c.accessRole === 'writer',
      proprietaire: c.accessRole === 'owner',
    }));
  }

  // Les événements d'une période, occurrences déroulées par Google.
  async evenements(acces: string, agendaId: string, du: Date, au: Date): Promise<EvenementGoogle[]> {
    const p = new URLSearchParams({
      singleEvents: 'true',
      timeMin: du.toISOString(),
      timeMax: au.toISOString(),
      maxResults: '2500',
    });
    return this.pages<EvenementGoogle>(
      acces,
      `${API}/calendars/${encodeURIComponent(agendaId)}/events?${p.toString()}`,
    );
  }

  // Un événement précis (hors période lue) ; null s'il n'existe plus.
  async lire(acces: string, agendaId: string, id: string): Promise<EvenementGoogle | null> {
    try {
      return await this.json<EvenementGoogle>(
        acces,
        `${API}/calendars/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(id)}`,
        'GET',
      );
    } catch (e) {
      if (e instanceof ErreurGoogle && (e.statut === 404 || e.statut === 410)) return null;
      throw e;
    }
  }

  async creer(acces: string, agendaId: string, e: EcritureGoogle): Promise<EvenementGoogle> {
    return this.json(acces, `${API}/calendars/${encodeURIComponent(agendaId)}/events?sendUpdates=none`, 'POST', e);
  }

  async modifier(acces: string, agendaId: string, id: string, e: EcritureGoogle): Promise<EvenementGoogle> {
    return this.json(
      acces,
      `${API}/calendars/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(id)}?sendUpdates=none`,
      'PATCH',
      { ...e, start: { ...e.start, date: null }, end: { ...e.end, date: null } },
    );
  }

  async supprimer(acces: string, agendaId: string, id: string): Promise<void> {
    try {
      await this.json(
        acces,
        `${API}/calendars/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(id)}?sendUpdates=none`,
        'DELETE',
      );
    } catch (e) {
      // Déjà supprimé chez Google : c'est ce qu'on voulait.
      if (e instanceof ErreurGoogle && (e.statut === 404 || e.statut === 410)) return;
      throw e;
    }
  }

  private async pages<T>(
    acces: string,
    url: string,
    trop = 'Trop d’événements dans cet agenda pour la synchronisation.',
  ): Promise<T[]> {
    const items: T[] = [];
    let page: string | undefined;
    for (let tour = 0; ; tour++) {
      if (tour >= PAGES_MAX || items.length > ELEMENTS_MAX) throw new ErreurGoogle(413, trop);
      const r = await this.json<{ items?: T[]; nextPageToken?: string }>(
        acces,
        page ? `${url}${url.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(page)}` : url,
        'GET',
      );
      items.push(...(r.items ?? []));
      page = r.nextPageToken;
      if (!page) break;
    }
    return items;
  }

  private async json<T>(acces: string, url: string, methode: string, corps?: unknown): Promise<T> {
    const r = await this.fetchFn(url, {
      method: methode,
      headers: { Authorization: `Bearer ${acces}`, ...(corps ? { 'Content-Type': 'application/json' } : {}) },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (r.status === 204) return undefined as T;
    const texte = await r.text();
    if (!r.ok)
      throw new ErreurGoogle(r.status, `Google Agenda : ${messageGoogle(texte)} (${r.status})`, r.status === 401);
    return (texte ? JSON.parse(texte) : undefined) as T;
  }

  private async formulaire(url: string, champs: Record<string, string>): Promise<Record<string, unknown>> {
    const r = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(champs).toString(),
      signal: AbortSignal.timeout(DELAI_MS),
    });
    const texte = await r.text();
    if (!r.ok) {
      // invalid_grant : jeton révoqué ou expiré chez Google.
      const revoque = /invalid_grant/.test(texte);
      throw new ErreurGoogle(r.status, `Google : ${messageGoogle(texte)}`, revoque);
    }
    return JSON.parse(texte) as Record<string, unknown>;
  }
}

// L'adresse du compte, lue dans le jeton d'identité reçu directement de
// Google (canal TLS, pas de signature à revérifier ici).
// L'adresse (affichée) et l'identifiant stable (« sub ») du compte, lus dans
// le jeton d'identité rendu par Google à l'échange du code (canal direct,
// authentifié par le secret client : pas de vérification de signature utile).
export function identiteDuJeton(idToken: string): { compte: string; sujet: string } {
  try {
    const charge = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      email?: string;
      sub?: string;
    };
    return { compte: charge.email ?? '', sujet: typeof charge.sub === 'string' ? charge.sub : '' };
  } catch {
    return { compte: '', sujet: '' };
  }
}
export const adresseDuJeton = (idToken: string) => identiteDuJeton(idToken).compte;

function messageGoogle(texte: string): string {
  try {
    const r = JSON.parse(texte) as { error?: { message?: string } | string; error_description?: string };
    if (typeof r.error === 'object' && r.error?.message) return r.error.message;
    return r.error_description ?? String(r.error ?? 'erreur');
  } catch {
    return texte.slice(0, 200) || 'erreur';
  }
}
