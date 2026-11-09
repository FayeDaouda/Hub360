// @vitest-environment jsdom
// (le flux écoute document / window : retour au premier plan, réseau revenu)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from './fake-event-source';
import { connectSseStream, type SseStreamState } from './sse-stream';

// Flux SSE à reconnexion explicite (09/11/2026) : ticket à usage unique, donc
// chaque (ré)ouverture redemande un ticket frais, avec un backoff croissant
// (1 s, 2 s, 4 s… plafonné à 15 s), remis à 1 s dès que le flux s'ouvre.

function monter(types: readonly string[] = ['notification'], premierTicketRefuse = false) {
  let n = 0;
  const ticket = vi.fn(async () => ({ token: `T${++n}` }));
  if (premierTicketRefuse) ticket.mockRejectedValueOnce(new Error('401'));
  const onEvenement = vi.fn();
  const etats: SseStreamState[] = [];
  const fermer = connectSseStream({
    ticket,
    url: (token) => `https://api.test/flux?token=${token}`,
    types,
    onEvent: onEvenement,
    onState: (e) => etats.push(e),
  });
  return { ticket, onEvenement, etats, fermer };
}

// Laisse se résoudre le ticket (promesse) sans avancer l'horloge.
const laisserFiler = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('connectSseStream · sans EventSource', () => {
  it('rend une fermeture sans effet et ne demande aucun ticket (rendu serveur, vieux navigateur)', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('EventSource', undefined);
    const { ticket, etats, fermer } = monter();
    expect(() => fermer()).not.toThrow();
    expect(ticket).not.toHaveBeenCalled();
    expect(etats).toEqual([]);
  });
});

describe('connectSseStream · ouverture', () => {
  it('demande un ticket puis ouvre le flux à l’URL qui le porte', async () => {
    const { ticket, etats, fermer } = monter();
    expect(etats).toEqual(['connexion']);
    await laisserFiler();
    expect(ticket).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances.map((e) => e.url)).toEqual(['https://api.test/flux?token=T1']);
    fermer();
  });

  it('flux ouvert : état « ouvert »', async () => {
    const { etats, fermer } = monter();
    await laisserFiler();
    FakeEventSource.derniere().emettre('open');
    expect(etats).toEqual(['connexion', 'ouvert']);
    fermer();
  });

  it('relaie un événement écouté avec ses données JSON décodées', async () => {
    const { onEvenement, fermer } = monter(['message', 'non_lus']);
    await laisserFiler();
    FakeEventSource.derniere().emettre('non_lus', '{"canalId":"C1","nonLus":3}');
    expect(onEvenement).toHaveBeenCalledWith('non_lus', { canalId: 'C1', nonLus: 3 });
    fermer();
  });

  it('n’écoute que les types demandés (le battement « ping » est ignoré)', async () => {
    const { onEvenement, fermer } = monter(['notification']);
    await laisserFiler();
    const es = FakeEventSource.derniere();
    expect([...es.ecouteurs.keys()].sort()).toEqual(['error', 'notification', 'open']);
    es.emettre('ping', '{}');
    expect(onEvenement).not.toHaveBeenCalled();
    fermer();
  });

  it('trame illisible : ignorée, sans erreur ni coupure', async () => {
    const { onEvenement, etats, fermer } = monter();
    await laisserFiler();
    const es = FakeEventSource.derniere();
    expect(() => es.emettre('notification', 'pas du json')).not.toThrow();
    expect(onEvenement).not.toHaveBeenCalled();
    expect(es.ferme).toBe(false);
    es.emettre('notification', '{}');
    expect(onEvenement).toHaveBeenCalledWith('notification', {});
    expect(etats).toEqual(['connexion']);
    fermer();
  });
});

describe('connectSseStream · reconnexion', () => {
  it('erreur : ferme la source, se reconnecte après 1 s avec un ticket frais', async () => {
    const { ticket, etats, fermer } = monter();
    await laisserFiler();
    const premiere = FakeEventSource.derniere();
    premiere.emettre('open');
    premiere.emettre('error');
    expect(premiere.ferme).toBe(true);
    expect(etats.at(-1)).toBe('reconnexion');
    await vi.advanceTimersByTimeAsync(999);
    expect(ticket).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(ticket).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.derniere().url).toBe('https://api.test/flux?token=T2');
    fermer();
  });

  it('erreurs répétées : backoff 1 s, 2 s, 4 s ; remis à 1 s une fois ouvert', async () => {
    const { ticket, fermer } = monter();
    await laisserFiler();
    FakeEventSource.derniere().emettre('error');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ticket).toHaveBeenCalledTimes(2);

    FakeEventSource.derniere().emettre('error');
    await vi.advanceTimersByTimeAsync(1_999);
    expect(ticket).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(ticket).toHaveBeenCalledTimes(3);

    FakeEventSource.derniere().emettre('error');
    await vi.advanceTimersByTimeAsync(3_999);
    expect(ticket).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(ticket).toHaveBeenCalledTimes(4);

    // Ouvert : le compteur repart de 1 s.
    FakeEventSource.derniere().emettre('open');
    FakeEventSource.derniere().emettre('error');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ticket).toHaveBeenCalledTimes(5);
    fermer();
  });

  it('backoff plafonné à 15 s', async () => {
    const { ticket, fermer } = monter();
    await laisserFiler();
    // 1 + 2 + 4 + 8 + 15 s : la cinquième attente est plafonnée.
    for (const attente of [1_000, 2_000, 4_000, 8_000, 15_000]) {
      FakeEventSource.derniere().emettre('error');
      await vi.advanceTimersByTimeAsync(attente);
    }
    expect(ticket).toHaveBeenCalledTimes(6);
    FakeEventSource.derniere().emettre('error');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(ticket).toHaveBeenCalledTimes(7);
    fermer();
  });

  it('ticket refusé (réseau, session expirée) : nouvelle tentative après le backoff', async () => {
    const { ticket, etats, fermer } = monter(['notification'], true);
    await laisserFiler();
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(etats).toEqual(['connexion', 'reconnexion']);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ticket).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.instances).toHaveLength(1);
    fermer();
  });
});

describe('connectSseStream · fermeture', () => {
  it('ferme la source ; une erreur ensuite ne relance rien', async () => {
    const { ticket, fermer } = monter();
    await laisserFiler();
    const es = FakeEventSource.derniere();
    fermer();
    expect(es.ferme).toBe(true);
    es.emettre('error');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ticket).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('fermée pendant une reconnexion planifiée : plus de reconnexion', async () => {
    const { ticket, fermer } = monter();
    await laisserFiler();
    FakeEventSource.derniere().emettre('error');
    fermer();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ticket).toHaveBeenCalledTimes(1);
  });

  it('fermée pendant la demande de ticket : aucun flux ouvert', async () => {
    const { fermer } = monter();
    fermer();
    await laisserFiler();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});

// Retour au premier plan ou du réseau (09/11/2026) : sans flux ouvert, on
// n'attend pas la fin du backoff ; ticket frais et backoff remis à 1 s.
describe('connectSseStream · reprise immédiate', () => {
  let visibilite: DocumentVisibilityState = 'visible';
  beforeEach(() => {
    visibilite = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilite });
  });
  const auPremierPlan = () => document.dispatchEvent(new Event('visibilitychange'));
  const reseauRevenu = () => window.dispatchEvent(new Event('online'));

  it('retour au premier plan pendant le backoff : reconnexion aussitôt', async () => {
    const { ticket, fermer } = monter();
    await laisserFiler();
    FakeEventSource.derniere().emettre('error');
    auPremierPlan();
    await laisserFiler();
    expect(ticket).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.instances).toHaveLength(2);
    // Le backoff planifié est annulé : pas de troisième tentative à 1 s.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ticket).toHaveBeenCalledTimes(2);
    fermer();
  });

  it('réseau revenu : reconnexion aussitôt, backoff remis à 1 s', async () => {
    const { ticket, fermer } = monter();
    await laisserFiler();
    FakeEventSource.derniere().emettre('error');
    await vi.advanceTimersByTimeAsync(1_000);
    FakeEventSource.derniere().emettre('error'); // backoff suivant : 2 s
    reseauRevenu();
    await laisserFiler();
    expect(ticket).toHaveBeenCalledTimes(3);
    FakeEventSource.derniere().emettre('error');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ticket).toHaveBeenCalledTimes(4);
    fermer();
  });

  it('flux déjà ouvert : rien ne se passe', async () => {
    const { ticket, fermer } = monter();
    await laisserFiler();
    FakeEventSource.derniere().emettre('open');
    auPremierPlan();
    reseauRevenu();
    await laisserFiler();
    expect(ticket).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(1);
    fermer();
  });

  it('onglet caché : on attend la fin du backoff', async () => {
    const { ticket, fermer } = monter();
    await laisserFiler();
    FakeEventSource.derniere().emettre('error');
    visibilite = 'hidden';
    auPremierPlan();
    reseauRevenu();
    await laisserFiler();
    expect(ticket).toHaveBeenCalledTimes(1);
    fermer();
  });

  it('après fermeture : plus d’écoute du premier plan ni du réseau', async () => {
    const { ticket, fermer } = monter();
    await laisserFiler();
    FakeEventSource.derniere().emettre('error');
    fermer();
    auPremierPlan();
    reseauRevenu();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ticket).toHaveBeenCalledTimes(1);
  });

  it('pendant la demande de ticket : pas de seconde connexion en parallèle', async () => {
    const { ticket, fermer } = monter();
    // Ticket pas encore reçu : aucune source, aucun backoff planifié.
    reseauRevenu();
    auPremierPlan();
    await laisserFiler();
    expect(ticket).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(1);
    fermer();
    expect(FakeEventSource.instances.every((e) => e.ferme)).toBe(true);
  });
});
