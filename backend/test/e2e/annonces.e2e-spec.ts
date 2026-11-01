import { INestApplication } from '@nestjs/common';
import { api, COMPTES, connecter, demarrer } from './app';

type Vue = { annonces: { id: string; lue: boolean }[]; aValider: { id: string }[] };
type Matrice = { roles: { id: string; nom: string }[] };
const LEVS = { lecture: true, ecriture: true, validation: true, suppression: true };

// Annonces (lot 12, 01/11/2026).
describe('Annonces', () => {
  let app: INestApplication;
  let cio: string;
  let roleDirGc: string;
  beforeAll(async () => {
    app = await demarrer();
    cio = await connecter(app, COMPTES.cio);
    roleDirGc = ((await api(app, cio).get('/roles').expect(200)).body as Matrice).roles.find(
      (r) => r.nom === 'Dir. GC',
    )!.id;
  });
  afterAll(async () => {
    await api(app, cio).put('/roles/droits', {
      changements: [{ roleId: roleDirGc, etapeCle: 'annonces', droits: LEVS }],
    });
    await app.close();
  });

  it('importante, à tout le groupe : le Salarié la lit et dit « J’ai lu » ; il ne rédige pas', async () => {
    const ceo = await connecter(app, COMPTES.ceo);
    const salarie = await connecter(app, COMPTES.salarie);
    const { id, statut } = (
      await api(app, ceo)
        .post('/annonces', {
          titre: 'Fermeture du 28',
          contenu: 'Bureaux fermés le 28.',
          audience: 'groupe',
          importante: true,
        })
        .expect(201)
    ).body as { id: string; statut: string };
    expect(statut).toBe('publiee');
    expect(
      ((await api(app, salarie).get('/annonces').expect(200)).body as Vue).annonces.find((a) => a.id === id),
    ).toMatchObject({
      lue: false,
    });
    await api(app, salarie).post(`/annonces/${id}/lecture`).expect(200);
    expect(
      ((await api(app, salarie).get('/annonces').expect(200)).body as Vue).annonces.find((a) => a.id === id)?.lue,
    ).toBe(true);
    await api(app, salarie).post('/annonces', { titre: 'Test', contenu: 'Test', audience: 'societe' }).expect(403);
  });

  it('sans la Validation, l’annonce attend ; le CEO la publie', async () => {
    await api(app, cio)
      .put('/roles/droits', {
        changements: [{ roleId: roleDirGc, etapeCle: 'annonces', droits: { ...LEVS, validation: false } }],
      })
      .expect(200);
    const dirgc = await connecter(app, COMPTES.dirgc);
    const { id, statut } = (
      await api(app, dirgc)
        .post('/annonces', { titre: 'Visite de chantier', contenu: 'Jeudi 9 h.', audience: 'societe' })
        .expect(201)
    ).body as { id: string; statut: string };
    expect(statut).toBe('a_valider');
    const ceo = await connecter(app, COMPTES.ceo);
    expect(((await api(app, ceo).get('/annonces').expect(200)).body as Vue).aValider.some((a) => a.id === id)).toBe(
      true,
    );
    await api(app, ceo).post(`/annonces/${id}/validation`).expect(200);
    expect(((await api(app, dirgc).get('/annonces').expect(200)).body as Vue).annonces.some((a) => a.id === id)).toBe(
      true,
    );
  });
});
