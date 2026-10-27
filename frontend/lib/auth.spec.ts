// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { datesJeton, getSession, remplacerSession, saveSession } from './auth';
import type { Session } from './types';

// Jeton factice : seules ses dates sont lues côté navigateur.
const jeton = (iat: number, exp = iat + 3600) =>
  ['e30', btoa(JSON.stringify({ iat, exp })).replace(/=+$/, ''), 'signature'].join('.');

const session = (access_token: string, utilisateurId = 'U1'): Session => ({
  access_token,
  utilisateur: { id: utilisateurId, email: 'a@b.c', nom: 'Sarr', prenom: 'Awa' },
  societe: { id: 'S1', nom: 'Grey Concrete', slug: 'grey-concrete' },
  role: 'CFO',
  permissions: {},
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
});

describe('datesJeton', () => {
  it('lit les dates du jeton ; null pour un jeton illisible', () => {
    expect(datesJeton(jeton(1000, 4600))).toEqual({ iat: 1000, exp: 4600 });
    expect(datesJeton('pas-un-jeton')).toBeNull();
  });
});

describe('Session enregistrée (lot B)', () => {
  it('l’heure de réception du jeton est gardée tant que le jeton ne change pas', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    saveSession(session(jeton(100)), true);
    vi.setSystemTime(2_000_000);
    remplacerSession({ ...session(jeton(100)), role: 'CFO' });
    expect(getSession()?.recuLe).toBe(1_000_000);
    remplacerSession(session(jeton(200)));
    expect(getSession()?.recuLe).toBe(2_000_000);
  });

  it('une copie prise avant une prolongation ne remplace jamais le jeton plus récent', () => {
    saveSession(session(jeton(200)), true);
    const copie = session(jeton(100));
    copie.utilisateur.nomAffiche = 'Awa';
    remplacerSession(copie);
    expect(getSession()?.access_token).toBe(jeton(200));
    expect(getSession()?.utilisateur.nomAffiche).toBe('Awa');
  });

  it('un autre compte remplace la session entière', () => {
    saveSession(session(jeton(200)), true);
    remplacerSession(session(jeton(100), 'U2'));
    expect(getSession()?.access_token).toBe(jeton(100));
  });
});
