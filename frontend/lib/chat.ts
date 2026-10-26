import type { CanalChat, EtatFluxChat, EvenementChat, MembreAnnuaire, MessageChat, PageMessagesChat } from './types';
import { apiSociete } from './client-api';

// Chat multi-canaux (lot 3). API NestJS (src/chat) :
//   GET   /societes/:slug/canaux                       liste + non-lus par canal
//   GET   /societes/:slug/canaux/:id/messages?curseur= page (curseur = plus vieux)
//   POST  /societes/:slug/canaux/:id/messages          { texte }
//   PATCH /societes/:slug/canaux/:id/lecture           marque le canal lu
//   POST  /societes/:slug/canaux/direct                { avecUtilisateurId }
//   POST  /societes/:slug/chat/ticket                  jeton SSE (60 s, usage unique)
//   GET   /societes/:slug/chat/flux?token=             flux SSE (réception seule)
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export function getCanaux(slug: string): Promise<CanalChat[]> {
  return apiSociete<CanalChat[]>(slug, '/canaux');
}

export function getMessages(slug: string, canalId: string, curseur?: string): Promise<PageMessagesChat> {
  const qs = curseur ? `?curseur=${encodeURIComponent(curseur)}` : '';
  return apiSociete<PageMessagesChat>(slug, `/canaux/${canalId}/messages${qs}`);
}

export function envoyerMessage(slug: string, canalId: string, texte: string): Promise<MessageChat> {
  return apiSociete<MessageChat>(slug, `/canaux/${canalId}/messages`, {
    method: 'POST',
    body: { texte },
  });
}

export function marquerCanalLu(slug: string, canalId: string): Promise<{ nonLus: number }> {
  return apiSociete<{ nonLus: number }>(slug, `/canaux/${canalId}/lecture`, {
    method: 'PATCH',
  });
}

export function getAnnuaireChat(slug: string): Promise<MembreAnnuaire[]> {
  return apiSociete<MembreAnnuaire[]>(slug, '/annuaire');
}

export function ouvrirDirect(slug: string, avecUtilisateurId: string): Promise<CanalChat> {
  return apiSociete<CanalChat>(slug, '/canaux/direct', {
    method: 'POST',
    body: { avecUtilisateurId },
  });
}

function getTicketChat(slug: string): Promise<{ token: string }> {
  return apiSociete<{ token: string }>(slug, '/chat/ticket', {
    method: 'POST',
    body: {},
  });
}

type OptionsFlux = {
  slug: string;
  onEvenement: (e: EvenementChat) => void;
  onEtat: (etat: EtatFluxChat) => void;
};

// Connexion SSE au flux chat avec RECONNEXION EXPLICITE : le ticket serveur est
// à usage unique, donc la reprise native d'EventSource (qui rejouerait le jeton
// consommé → 401) est inutilisable. À chaque (ré)ouverture on récupère un
// ticket frais puis on ouvre un EventSource ; `error` → backoff → nouveau
// ticket → nouvel EventSource. Retourne une fonction de fermeture.
export function connecterFluxChat(opts: OptionsFlux): () => void {
  let es: EventSource | null = null;
  let ferme = false;
  let jamaisOuvert = true;
  let backoff = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function ouvrir() {
    if (ferme) return;
    opts.onEtat(jamaisOuvert ? 'connexion' : 'reconnexion');

    let token: string;
    try {
      ({ token } = await getTicketChat(opts.slug));
    } catch {
      replanifier();
      return;
    }
    if (ferme) return;

    const source = new EventSource(`${API_URL}/societes/${opts.slug}/chat/flux?token=${encodeURIComponent(token)}`);
    es = source;

    source.addEventListener('open', () => {
      jamaisOuvert = false;
      backoff = 1000;
      opts.onEtat('ouvert');
    });

    const relais = (type: 'message' | 'non_lus') => (ev: MessageEvent<string>) => {
      try {
        opts.onEvenement({ type, ...JSON.parse(ev.data) } as EvenementChat);
      } catch {
        /* trame illisible — ignorée */
      }
    };
    source.addEventListener('message', relais('message'));
    source.addEventListener('non_lus', relais('non_lus'));
    // 'ping' : battement serveur, rien à faire.

    source.addEventListener('error', () => {
      source.close();
      if (es === source) es = null;
      replanifier();
    });
  }

  function replanifier() {
    if (ferme || timer) return;
    opts.onEtat('reconnexion');
    timer = setTimeout(() => {
      timer = null;
      void ouvrir();
    }, backoff);
    backoff = Math.min(backoff * 2, 15_000);
  }

  void ouvrir();

  return () => {
    ferme = true;
    if (timer) clearTimeout(timer);
    es?.close();
  };
}
