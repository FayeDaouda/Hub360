import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SseStreamState } from './sse-stream';
import { connecterFluxNotifications, getNotifications } from './notifications';
import { useNotificationsPoll } from './use-notifications-poll';

// Cloche en temps réel (09/11/2026) : chaque signal du flux relit les
// notifications (signaux rapprochés regroupés sur 250 ms) ; le sondage reste
// le filet, toutes les 60 s quand le flux est ouvert, 15 s sinon.
vi.mock('./notifications', () => ({
  connecterFluxNotifications: vi.fn(),
  getNotifications: vi.fn(),
  marquerLuesParId: vi.fn(),
  marquerNotificationsLues: vi.fn(),
}));
vi.mock('./notification-sound', () => ({ jouerSonNotification: vi.fn() }));
vi.mock('./preferences-notifications', () => ({ popupPermis: () => true, sonPermis: () => false }));

const lire = vi.mocked(getNotifications);
const connecter = vi.mocked(connecterFluxNotifications);
const fermerFlux = vi.fn();

type OptionsFlux = Parameters<typeof connecterFluxNotifications>[0];
const flux = (): OptionsFlux => {
  const opts = connecter.mock.calls.at(-1)?.[0];
  if (!opts) throw new Error('Flux non connecté');
  return opts;
};
const avancer = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const etat = (e: SseStreamState) => act(() => flux().onEtat?.(e));

beforeEach(() => {
  vi.useFakeTimers();
  lire.mockResolvedValue({ nonLues: 0, elements: [] });
  connecter.mockReturnValue(fermerFlux);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useNotificationsPoll · flux temps réel', () => {
  it('se connecte au flux de la société et lit la cloche au montage', async () => {
    renderHook(() => useNotificationsPoll('grey-concrete'));
    await avancer(0);
    expect(connecter).toHaveBeenCalledWith(expect.objectContaining({ slug: 'grey-concrete' }));
    expect(lire).toHaveBeenCalledTimes(1);
    expect(lire).toHaveBeenCalledWith('grey-concrete');
  });

  it('un signal relit la cloche 250 ms après', async () => {
    renderHook(() => useNotificationsPoll('grey-concrete'));
    await avancer(0);
    act(() => flux().onSignal());
    await avancer(249);
    expect(lire).toHaveBeenCalledTimes(1);
    await avancer(1);
    expect(lire).toHaveBeenCalledTimes(2);
  });

  it('plusieurs signaux rapprochés : une seule relecture', async () => {
    renderHook(() => useNotificationsPoll('grey-concrete'));
    await avancer(0);
    act(() => {
      flux().onSignal();
      flux().onSignal();
    });
    await avancer(100);
    act(() => flux().onSignal());
    await avancer(1_000);
    expect(lire).toHaveBeenCalledTimes(2);
  });

  it('met à jour la cloche avec le flux relu', async () => {
    const { result } = renderHook(() => useNotificationsPoll('grey-concrete'));
    await avancer(0);
    lire.mockResolvedValue({ nonLues: 4, elements: [] });
    act(() => flux().onSignal());
    await avancer(250);
    expect(result.current.flux).toEqual({ nonLues: 4, elements: [] });
  });

  it('démontage : flux fermé, relecture en attente annulée', async () => {
    const { unmount } = renderHook(() => useNotificationsPoll('grey-concrete'));
    await avancer(0);
    act(() => flux().onSignal());
    unmount();
    expect(fermerFlux).toHaveBeenCalledTimes(1);
    await avancer(60_000);
    expect(lire).toHaveBeenCalledTimes(1);
  });
});

describe('useNotificationsPoll · sondage de secours', () => {
  it('flux pas encore ouvert : sondage toutes les 15 s', async () => {
    renderHook(() => useNotificationsPoll('grey-concrete'));
    await avancer(0);
    await avancer(15_000);
    expect(lire).toHaveBeenCalledTimes(2);
    await avancer(15_000);
    expect(lire).toHaveBeenCalledTimes(3);
  });

  it('flux ouvert : relecture immédiate (rattrapage), puis sondage toutes les 60 s', async () => {
    renderHook(() => useNotificationsPoll('grey-concrete'));
    await avancer(0);
    etat('ouvert');
    await avancer(0);
    expect(lire).toHaveBeenCalledTimes(2);
    await avancer(59_999);
    expect(lire).toHaveBeenCalledTimes(2);
    await avancer(1);
    expect(lire).toHaveBeenCalledTimes(3);
  });

  it('flux coupé (reconnexion) : retour au sondage toutes les 15 s', async () => {
    renderHook(() => useNotificationsPoll('grey-concrete'));
    await avancer(0);
    etat('ouvert');
    await avancer(0);
    etat('reconnexion');
    await avancer(0);
    expect(lire).toHaveBeenCalledTimes(3);
    await avancer(15_000);
    expect(lire).toHaveBeenCalledTimes(4);
  });
});
