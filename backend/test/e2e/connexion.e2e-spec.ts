import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { api, COMPTES, connecter, demarrer, MOT_DE_PASSE, SLUG } from './app';

// Parcours 1 — connexion et droits : la porte d'entrée et la matrice.
describe('Connexion et droits', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await demarrer();
  });
  afterAll(() => app.close());

  it('refuse un mauvais mot de passe sans dire si le compte existe', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: COMPTES.cio, motDePasse: 'faux-mot-de-passe', societeSlug: SLUG })
      .expect(401);
    expect(r.body.message).toBe('Identifiants invalides');
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'personne@nulle.part', motDePasse: 'x', societeSlug: SLUG })
      .expect(401);
  });

  it('ouvre une session avec le rôle et les droits de la matrice', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: COMPTES.cfo, motDePasse: MOT_DE_PASSE, societeSlug: SLUG })
      .expect(200);
    expect(r.body.role).toBe('CFO');
    expect(r.body.permissions.finances_factures).toBe('validation');
  });

  it('refuse une route protégée sans session, et hors droits pour le rôle', async () => {
    await request(app.getHttpServer()).get(`/api/societes/${SLUG}/dossiers`).expect(401);
    const salarie = await connecter(app, COMPTES.salarie);
    await api(app, salarie).get('/dossiers').expect(403);
    await api(app, salarie).get('/factures').expect(403);
    const cfo = await connecter(app, COMPTES.cfo);
    await api(app, cfo).get('/factures').expect(200);
  });

  it('changer son mot de passe coupe les sessions ouvertes avant', async () => {
    const ancienne = await connecter(app, COMPTES.dirgc);
    await api(app, ancienne).get('/dossiers').expect(200);
    const r = await request(app.getHttpServer())
      .post('/api/auth/mot-de-passe')
      .set('Authorization', `Bearer ${ancienne}`)
      .send({ actuel: MOT_DE_PASSE, nouveau: 'NouveauMotDePasse2026!' })
      .expect(200);
    await api(app, ancienne).get('/dossiers').expect(401);
    await api(app, r.body.access_token).get('/dossiers').expect(200);
    // Remis en l'état pour les autres parcours.
    await request(app.getHttpServer())
      .post('/api/auth/mot-de-passe')
      .set('Authorization', `Bearer ${r.body.access_token}`)
      .send({ actuel: 'NouveauMotDePasse2026!', nouveau: MOT_DE_PASSE })
      .expect(200);
  });
});
