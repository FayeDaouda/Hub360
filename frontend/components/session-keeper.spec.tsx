import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession, retourConnexion, saveSession } from '@/lib/auth';
import { prolongerSession } from '@/lib/profil';
import type { Session } from '@/lib/types';
import { SessionKeeper } from './session-keeper';

const navigation = vi.hoisted(() => ({ chemin: '/admin/grey-concrete' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.chemin }));
vi.mock('@/lib/profil', () => ({ prolongerSession: vi.fn() }));
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  retourConnexion: vi.fn(),
}));

const MAINTENANT = Date.UTC(2026, 9, 28, 9);
const S = Math.floor(MAINTENANT / 1000);
const jeton = (iat: number, exp = iat + 3600) =>
  ['e30', btoa(JSON.stringify({ iat, exp })).replace(/=+$/, ''), 'signature'].join('.');
const session = (access_token: string): Session => ({
  access_token,
  utilisateur: { id: 'U1', email: 'a@b.c', nom: 'Sarr', prenom: 'Awa' },
  societe: { id: 'S1', nom: 'Grey Concrete', slug: 'grey-concrete' },
  role: 'CFO',
  permissions: {},
});
const prolonger = vi.mocked(prolongerSession);

beforeEach(() => {
  vi.useFakeTimers({ now: MAINTENANT });
  navigation.chemin = '/admin/grey-concrete';
  prolonger.mockResolvedValue({ access_token: jeton(S + 1), permissions: { crm: 'lecture' } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('SessionKeeper (lot B)', () => {
  it('prolonge la session à la première activité, puis au plus toutes les 5 minutes', async () => {
    saveSession(session(jeton(S)), true);
    render(<SessionKeeper />);
    fireEvent.pointerDown(window);
    await act(async () => {});
    expect(prolonger).toHaveBeenCalledTimes(1);
    expect(getSession()?.access_token).toBe(jeton(S + 1));
    // Droits relus avec le jeton (interrupteurs de l'Administrateur HUB).
    expect(getSession()?.permissions).toEqual({ crm: 'lecture' });

    fireEvent.keyDown(window);
    expect(prolonger).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(5 * 60_000));
    fireEvent.keyDown(window);
    expect(prolonger).toHaveBeenCalledTimes(2);
  });

  it('ne prolonge ni ne ferme rien hors des espaces connectés', () => {
    navigation.chemin = '/login/grey-concrete';
    saveSession(session(jeton(S - 7200)), true);
    vi.setSystemTime(MAINTENANT + 2 * 3600_000);
    render(<SessionKeeper />);
    fireEvent.pointerDown(window);
    expect(prolonger).not.toHaveBeenCalled();
    expect(retourConnexion).not.toHaveBeenCalled();
  });

  it('à l’échéance du jeton, sans activité : retour à l’écran de connexion', async () => {
    saveSession(session(jeton(S)), true);
    render(<SessionKeeper />);
    await act(async () => vi.advanceTimersByTime(59 * 60_000));
    expect(retourConnexion).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(retourConnexion).toHaveBeenCalledWith('grey-concrete');
  });

  it('une horloge du poste décalée ne ferme pas la session en avance', async () => {
    // Le poste a dix heures d'avance sur le serveur : le jeton paraît échu.
    saveSession(session(jeton(S - 10 * 3600)), true);
    render(<SessionKeeper />);
    await act(async () => vi.advanceTimersByTime(30 * 60_000));
    expect(retourConnexion).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(30 * 60_000));
    expect(retourConnexion).toHaveBeenCalledWith('grey-concrete');
  });
});
