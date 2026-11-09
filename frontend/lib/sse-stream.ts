// Flux SSE avec RECONNEXION EXPLICITE (messagerie, notifications). Le ticket
// serveur est à usage unique, donc la reprise native d'EventSource (qui
// rejouerait le jeton consommé → 401) est inutilisable : à chaque
// (ré)ouverture on récupère un ticket frais puis on ouvre un EventSource ;
// `error` → backoff → nouveau ticket → nouvel EventSource.

export type SseStreamState = 'connexion' | 'reconnexion' | 'ouvert';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

type SseStreamOptions = {
  // Ticket frais (POST authentifié) ; une erreur replanifie la connexion.
  ticket: () => Promise<{ token: string }>;
  url: (token: string) => string;
  // Types d'événements écoutés ('ping', battement serveur, est ignoré).
  types: readonly string[];
  onEvent: (type: string, data: unknown) => void;
  onState?: (etat: SseStreamState) => void;
};

// Retourne une fonction de fermeture.
export function connectSseStream(opts: SseStreamOptions): () => void {
  // Rendu serveur, vieux navigateur, tests : pas de flux, le sondage suffit.
  if (typeof EventSource === 'undefined') return () => {};
  let es: EventSource | null = null;
  let closed = false;
  let neverOpened = true;
  let backoff = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Ticket en cours de demande : pas de seconde ouverture en parallèle.
  let opening = false;

  async function open() {
    if (closed) return;
    opts.onState?.(neverOpened ? 'connexion' : 'reconnexion');

    let token: string;
    opening = true;
    try {
      ({ token } = await opts.ticket());
    } catch {
      opening = false;
      scheduleRetry();
      return;
    }
    opening = false;
    if (closed) return;

    const source = new EventSource(opts.url(token));
    es = source;

    source.addEventListener('open', () => {
      neverOpened = false;
      backoff = 1000;
      opts.onState?.('ouvert');
    });

    for (const type of opts.types) {
      source.addEventListener(type, (ev: MessageEvent<string>) => {
        try {
          opts.onEvent(type, JSON.parse(ev.data));
        } catch {
          /* trame illisible — ignorée */
        }
      });
    }

    source.addEventListener('error', () => {
      source.close();
      if (es === source) es = null;
      scheduleRetry();
    });
  }

  function scheduleRetry() {
    if (closed || timer) return;
    opts.onState?.('reconnexion');
    timer = setTimeout(() => {
      timer = null;
      void open();
    }, backoff);
    backoff = Math.min(backoff * 2, 15_000);
  }

  // Retour au premier plan (téléphone, onglet) ou du réseau : sans flux
  // ouvert, on n'attend pas la fin du backoff (jusqu'à 15 s).
  function resume() {
    if (closed || es || opening || document.visibilityState !== 'visible') return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    backoff = 1000;
    void open();
  }
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);

  void open();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    es?.close();
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', resume);
  };
}
