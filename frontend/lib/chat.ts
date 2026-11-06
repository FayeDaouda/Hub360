import type {
  CanalChat,
  EtatFluxChat,
  EvenementChat,
  MembreAnnuaire,
  MessageChat,
  PageMessagesChat,
  LectureChat,
  PersonneChat,
  ReactionChat,
  ResultatRechercheChat,
} from './types';
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

export type EnvoiMessage = {
  texte: string;
  mentionIds?: string[];
  mentionTous?: boolean;
  reponseAId?: string;
  pieces?: { nom: string; url: string }[];
};
export function envoyerMessage(slug: string, canalId: string, envoi: EnvoiMessage): Promise<MessageChat> {
  return apiSociete<MessageChat>(slug, `/canaux/${canalId}/messages`, { method: 'POST', body: envoi });
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

    const relais = (type: EvenementChat['type']) => (ev: MessageEvent<string>) => {
      try {
        opts.onEvenement({ type, ...JSON.parse(ev.data) } as EvenementChat);
      } catch {
        /* trame illisible — ignorée */
      }
    };
    for (const type of ['message', 'non_lus', 'message_modifie', 'reactions', 'frappe', 'lecture'] as const) {
      source.addEventListener(type, relais(type));
    }
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

// Groupes de discussion et mentions (01/11/2026).
export const getMentionnables = (slug: string, canalId: string) =>
  apiSociete<PersonneChat[]>(slug, `/canaux/${canalId}/mentionnables`);
export const creerGroupe = (slug: string, nom: string, membreIds: string[]) =>
  apiSociete<CanalChat>(slug, '/canaux/groupes', { method: 'POST', body: { nom, membreIds } });
export const getMembresGroupe = (slug: string, canalId: string) =>
  apiSociete<PersonneChat[]>(slug, `/canaux/${canalId}/membres`);
export const ajouterMembresGroupe = (slug: string, canalId: string, membreIds: string[]) =>
  apiSociete<PersonneChat[]>(slug, `/canaux/${canalId}/membres`, { method: 'POST', body: { membreIds } });
export const retirerMembreGroupe = (slug: string, canalId: string, utilisateurId: string) =>
  apiSociete<{ ok: true }>(slug, `/canaux/${canalId}/membres/${utilisateurId}`, { method: 'DELETE' });
export const renommerGroupe = (slug: string, canalId: string, nom: string) =>
  apiSociete<{ ok: true }>(slug, `/canaux/${canalId}`, { method: 'PATCH', body: { nom } });

// Ouvre une conversation depuis n'importe où (clic sur une notification de
// mention) : la messagerie de la barre du haut l'écoute.
const EVENEMENT_CONVERSATION = 'hub:ouvrir-conversation';
export function ouvrirConversation(canalId: string) {
  window.dispatchEvent(new CustomEvent(EVENEMENT_CONVERSATION, { detail: canalId }));
}
export function surOuvrirConversation(f: (canalId: string) => void): () => void {
  const ecoute = (e: Event) => f((e as CustomEvent<string>).detail);
  window.addEventListener(EVENEMENT_CONVERSATION, ecoute);
  return () => window.removeEventListener(EVENEMENT_CONVERSATION, ecoute);
}

// Messagerie, suite (02/11/2026) : modifier, supprimer, réagir, pièces,
// « en train d'écrire », lectures, recherche, conversation d'un projet.
export const EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '✅'];
export const DELAI_MODIFICATION_MS = 15 * 60_000;
export const modifierMessage = (slug: string, canalId: string, id: string, texte: string) =>
  apiSociete<MessageChat>(slug, `/canaux/${canalId}/messages/${id}`, { method: 'PATCH', body: { texte } });
export const supprimerMessage = (slug: string, canalId: string, id: string) =>
  apiSociete<MessageChat>(slug, `/canaux/${canalId}/messages/${id}`, { method: 'DELETE' });
export const reagir = (slug: string, canalId: string, id: string, emoji: string) =>
  apiSociete<ReactionChat[]>(slug, `/canaux/${canalId}/messages/${id}/reactions`, { method: 'POST', body: { emoji } });
export const getPieceMessage = (slug: string, canalId: string, messageId: string, pieceId: string) =>
  apiSociete<{ nom: string; url: string; type: string }>(
    slug,
    `/canaux/${canalId}/messages/${messageId}/pieces/${pieceId}`,
  );
export const signalerFrappe = (slug: string, canalId: string) =>
  apiSociete<{ ok: true }>(slug, `/canaux/${canalId}/frappe`, { method: 'POST', body: {} });
export const getLectures = (slug: string, canalId: string) =>
  apiSociete<LectureChat[]>(slug, `/canaux/${canalId}/lectures`);
export const rechercherMessages = (slug: string, q: string) =>
  apiSociete<ResultatRechercheChat[]>(slug, `/canaux/recherche?q=${encodeURIComponent(q)}`);
export const ouvrirConversationProjet = (slug: string, projetId: string) =>
  apiSociete<{ canalId: string }>(slug, `/projets-ouverts/${projetId}/conversation`, { method: 'POST', body: {} });
