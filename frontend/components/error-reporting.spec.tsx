import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorReporting } from './error-reporting';

const session = vi.hoisted(() => ({ current: null as null | { access_token: string } }));
vi.mock('@/lib/auth', () => ({ getSession: () => session.current }));

function erreur(message: string) {
  window.dispatchEvent(new ErrorEvent('error', { message, error: new Error(message) }));
}

describe('ErrorReporting', () => {
  const envoi = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  beforeEach(() => {
    envoi.mockClear();
    vi.stubGlobal('fetch', envoi);
    session.current = { access_token: 'jeton' };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('remonte une erreur avec la page, la pile et la session', () => {
    render(<ErrorReporting />);
    erreur('TypeError: x is undefined');
    expect(envoi).toHaveBeenCalledTimes(1);
    const [url, options] = envoi.mock.calls[0];
    expect(url).toMatch(/\/erreurs-client$/);
    expect(options.headers.Authorization).toBe('Bearer jeton');
    expect(JSON.parse(options.body)).toMatchObject({ message: 'TypeError: x is undefined', page: '/' });
    expect(JSON.parse(options.body).stack).toContain('TypeError');
  });

  it('sans doublon, au plus cinq par page, sans le bruit des navigateurs', () => {
    render(<ErrorReporting />);
    erreur('a');
    erreur('a');
    erreur('ResizeObserver loop completed with undelivered notifications.');
    for (const m of ['b', 'c', 'd', 'e', 'f', 'g']) erreur(m);
    expect(envoi.mock.calls.map(([, o]) => JSON.parse(o.body).message)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('sans session : rien n’est envoyé', () => {
    session.current = null;
    render(<ErrorReporting />);
    erreur('a');
    expect(envoi).not.toHaveBeenCalled();
  });
});
