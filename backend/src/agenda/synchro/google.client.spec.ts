import { createHash } from 'crypto';
import { adresseDuJeton, ClientGoogle, ErreurGoogle, pkce, PORTEES_GOOGLE } from './google.client';

// Client Google Agenda (16/11/2026) : jamais d'appel réel, un faux `fetch`.
const ENV = { GOOGLE_CLIENT_ID: 'id-client', GOOGLE_CLIENT_SECRET: 'secret' };
const reponse = (statut: number, corps: unknown) =>
  ({
    ok: statut < 400,
    status: statut,
    text: () => Promise.resolve(corps === undefined ? '' : JSON.stringify(corps)),
  }) as Response;
const jetonIdentite = (email: string, sub: string | null = 'SUB-1') =>
  `x.${Buffer.from(JSON.stringify({ email, sub })).toString('base64url')}.y`;

describe('ClientGoogle', () => {
  it('l’adresse d’autorisation : PKCE S256, accès hors ligne, seulement l’agenda', () => {
    const url = new URL(
      new ClientGoogle(jest.fn(), ENV).urlAutorisation('ETAT', 'DEFI', 'https://hub/api/agenda/google/retour'),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'id-client',
      redirect_uri: 'https://hub/api/agenda/google/retour',
      response_type: 'code',
      access_type: 'offline',
      state: 'ETAT',
      code_challenge: 'DEFI',
      code_challenge_method: 'S256',
      scope: PORTEES_GOOGLE.join(' '),
    });
    expect(PORTEES_GOOGLE.join(' ')).not.toMatch(/gmail|contacts|drive/);
  });

  it('PKCE : le défi est l’empreinte SHA-256 du vérificateur', () => {
    const { verificateur, defi } = pkce();
    expect(defi).toBe(createHash('sha256').update(verificateur).digest('base64url'));
    expect(verificateur).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('échanger le code : jeton de rafraîchissement et adresse ; sans accès hors ligne, refusé', async () => {
    const f = jest.fn().mockResolvedValue(reponse(200, { refresh_token: 'R1', id_token: jetonIdentite('awa@gc.sn') }));
    const g = new ClientGoogle(f, ENV);
    expect(await g.echangerCode('CODE', 'VERIF', 'https://hub/retour')).toEqual({
      rafraichissement: 'R1',
      compte: 'awa@gc.sn',
      sujet: 'SUB-1', // l'identifiant stable du compte (l'adresse peut changer)
    });
    const corps = new URLSearchParams(f.mock.calls[0][1].body);
    expect(Object.fromEntries(corps)).toMatchObject({
      code: 'CODE',
      code_verifier: 'VERIF',
      grant_type: 'authorization_code',
    });
    f.mockResolvedValue(reponse(200, { access_token: 'A' }));
    await expect(g.echangerCode('CODE', 'VERIF', 'x')).rejects.toThrow('accès hors ligne');
    // Sans identité du compte : refusé (rien ne permettrait de le reconnaître).
    f.mockResolvedValue(reponse(200, { refresh_token: 'R1', id_token: jetonIdentite('awa@gc.sn', null) }));
    await expect(g.echangerCode('CODE', 'VERIF', 'x')).rejects.toThrow('identité du compte');
  });

  it('jeton révoqué chez Google (invalid_grant) : erreur « accès révoqué »', async () => {
    const g = new ClientGoogle(jest.fn().mockResolvedValue(reponse(400, { error: 'invalid_grant' })), ENV);
    const e = await g.acces('R1').catch((x) => x);
    expect(e).toBeInstanceOf(ErreurGoogle);
    expect(e.accesRevoque).toBe(true);
  });

  it('les événements : occurrences déroulées, toutes les pages', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(reponse(200, { items: [{ id: 'E1' }], nextPageToken: 'P2' }))
      .mockResolvedValueOnce(reponse(200, { items: [{ id: 'E2' }] }));
    const g = new ClientGoogle(f, ENV);
    const ev = await g.evenements(
      'A',
      'perso@gmail.com',
      new Date('2026-11-01T00:00:00Z'),
      new Date('2026-12-01T00:00:00Z'),
    );
    expect(ev.map((e) => e.id)).toEqual(['E1', 'E2']);
    const premiere = new URL(f.mock.calls[0][0]);
    expect(premiere.pathname).toBe('/calendar/v3/calendars/perso%40gmail.com/events');
    expect(premiere.searchParams.get('singleEvents')).toBe('true');
    expect(new URL(f.mock.calls[1][0]).searchParams.get('pageToken')).toBe('P2');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer A');
  });

  it('trop d’événements : refusé plutôt que tronqué (une liste tronquée ferait croire à des suppressions)', async () => {
    let n = 0;
    const f = jest.fn().mockImplementation(() =>
      Promise.resolve(
        reponse(200, {
          items: Array.from({ length: 2500 }, () => ({ id: `E${n++}` })),
          nextPageToken: 'SUITE',
        }),
      ),
    );
    const g = new ClientGoogle(f, ENV);
    await expect(g.evenements('A', 'p', new Date(), new Date())).rejects.toMatchObject({ statut: 413 });
    expect(f.mock.calls.length).toBeLessThanOrEqual(3);
    // Des pages courtes ne bloquent pas : seul le nombre d'éléments compte.
    let page = 0;
    const courtes = new ClientGoogle(
      jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            reponse(200, { items: [{ id: `C${page}` }], ...(++page < 5 ? { nextPageToken: `P${page}` } : {}) }),
          ),
        ),
      ENV,
    );
    expect(await courtes.evenements('A', 'p', new Date(), new Date())).toHaveLength(5);
  });

  it('les agendas : nom, principal, droit d’écrire, propriétaire', async () => {
    const g = new ClientGoogle(
      jest.fn().mockResolvedValue(
        reponse(200, {
          items: [
            { id: 'p', summary: 'Awa', primary: true, accessRole: 'owner', backgroundColor: '#123456' },
            { id: 'f', summary: 'Fériés', accessRole: 'reader' },
          ],
        }),
      ),
      ENV,
    );
    expect(await g.agendas('A')).toEqual([
      { id: 'p', nom: 'Awa', couleur: '#123456', principal: true, ecriture: true, proprietaire: true },
      { id: 'f', nom: 'Fériés', couleur: null, principal: false, ecriture: false, proprietaire: false },
    ]);
  });

  it('supprimer un événement déjà supprimé chez Google : sans erreur', async () => {
    const g = new ClientGoogle(
      jest.fn().mockResolvedValue(reponse(410, { error: { message: 'Resource has been deleted' } })),
      ENV,
    );
    await expect(g.supprimer('A', 'p', 'E1')).resolves.toBeUndefined();
    const autre = new ClientGoogle(jest.fn().mockResolvedValue(reponse(403, { error: { message: 'Forbidden' } })), ENV);
    await expect(autre.supprimer('A', 'p', 'E1')).rejects.toThrow('Forbidden');
  });

  it('configuré seulement avec l’identifiant et le secret ; adresse illisible : vide', () => {
    expect(new ClientGoogle(jest.fn(), ENV).configure()).toBe(true);
    expect(new ClientGoogle(jest.fn(), {}).configure()).toBe(false);
    expect(adresseDuJeton('pas-un-jeton')).toBe('');
  });
});
