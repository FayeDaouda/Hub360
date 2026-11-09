// @vitest-environment jsdom
// (le flux écoute document / window : retour au premier plan, réseau revenu)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiSociete } from './client-api';
import { connecterFluxChat } from './chat';
import { FakeEventSource } from './fake-event-source';
import { API_URL } from './sse-stream';
import type { EtatFluxChat, EvenementChat } from './types';

// Non-régression (09/11/2026) : le flux de la messagerie passe désormais par
// lib/flux-sse.ts ; mêmes types d'événements, même forme { type, ...données },
// même ticket (POST …/chat/ticket) et même URL qu'avant.
vi.mock('./client-api', () => ({ apiSociete: vi.fn() }));
const api = vi.mocked(apiSociete);

const TYPES_CHAT = ['message', 'non_lus', 'message_modifie', 'reactions', 'frappe', 'lecture'];

function monter() {
  const evenements: EvenementChat[] = [];
  const etats: EtatFluxChat[] = [];
  const fermer = connecterFluxChat({
    slug: 'grey-concrete',
    onEvenement: (e) => evenements.push(e),
    onEtat: (e) => etats.push(e),
  });
  return { evenements, etats, fermer };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  api.mockResolvedValue({ token: 'a b' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('connecterFluxChat', () => {
  it('demande le ticket de la messagerie, puis ouvre le flux de la société (jeton encodé)', async () => {
    const { fermer } = monter();
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledWith('grey-concrete', '/chat/ticket', { method: 'POST', body: {} });
    expect(FakeEventSource.derniere().url).toBe(`${API_URL}/societes/grey-concrete/chat/flux?token=a%20b`);
    fermer();
  });

  it('écoute toujours les mêmes six types d’événements', async () => {
    const { fermer } = monter();
    await vi.advanceTimersByTimeAsync(0);
    const ecoutes = [...FakeEventSource.derniere().ecouteurs.keys()].filter((t) => t !== 'open' && t !== 'error');
    expect(ecoutes.sort()).toEqual([...TYPES_CHAT].sort());
    fermer();
  });

  it('relaie chaque événement sous la forme { type, ...données }', async () => {
    const { evenements, fermer } = monter();
    await vi.advanceTimersByTimeAsync(0);
    const es = FakeEventSource.derniere();
    es.emettre('non_lus', JSON.stringify({ canalId: 'C1', nonLus: 2 }));
    es.emettre('frappe', JSON.stringify({ canalId: 'C1', utilisateurId: 'U2', nom: 'Awa' }));
    expect(evenements).toEqual([
      { type: 'non_lus', canalId: 'C1', nonLus: 2 },
      { type: 'frappe', canalId: 'C1', utilisateurId: 'U2', nom: 'Awa' },
    ]);
    fermer();
  });

  it('transmet les états de connexion (connexion → ouvert → reconnexion)', async () => {
    const { etats, fermer } = monter();
    await vi.advanceTimersByTimeAsync(0);
    FakeEventSource.derniere().emettre('open');
    FakeEventSource.derniere().emettre('error');
    expect(etats).toEqual(['connexion', 'ouvert', 'reconnexion']);
    fermer();
  });
});
