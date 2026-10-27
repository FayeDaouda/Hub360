import { afterEach, describe, expect, it, vi } from 'vitest';
import { EchecConnexion, login } from './api';

const reponse = (status: number, corps: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(corps), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('login : motif de l’échec', () => {
  it('compte verrouillé (423, lot C) : le texte du serveur, avec l’heure de fin', async () => {
    const message = 'Compte verrouillé jusqu’à 10:15 (heure de Dakar) après 10 essais infructueux.';
    vi.stubGlobal('fetch', reponse(423, { statusCode: 423, error: 'Locked', message }));
    const echec = await login('a@b.c', 'x', 'grey-concrete').catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(EchecConnexion);
    expect(echec).toMatchObject({ motif: 'verrouille', detail: message });
  });

  it('401 : identifiants, sans détail (anti-énumération)', async () => {
    vi.stubGlobal('fetch', reponse(401, { message: 'Identifiants invalides' }));
    await expect(login('a@b.c', 'x', 'grey-concrete')).rejects.toMatchObject({
      motif: 'identifiants',
      detail: undefined,
    });
  });
});
