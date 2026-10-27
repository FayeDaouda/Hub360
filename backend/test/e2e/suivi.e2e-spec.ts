import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { COMPTES, connecter, demarrer } from './app';

// Exploitation : état de santé de l'API et erreurs remontées par le navigateur.
describe('Suivi et santé', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await demarrer();
  });
  afterAll(() => app.close());

  it('répond « ok » sur /api/sante, sans session', async () => {
    const r = await request(app.getHttpServer()).get('/api/sante').expect(200);
    expect(r.body).toEqual({ statut: 'ok' });
  });

  it('reçoit une erreur du navigateur d’un utilisateur connecté, et seulement de lui', async () => {
    const erreur = { message: 'TypeError: x is undefined', page: '/admin/grey-concrete/facturation' };
    await request(app.getHttpServer()).post('/api/erreurs-client').send(erreur).expect(401);
    const jeton = await connecter(app, COMPTES.salarie);
    const ecrit = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await request(app.getHttpServer())
      .post('/api/erreurs-client')
      .set('Authorization', `Bearer ${jeton}`)
      .send(erreur)
      .expect(204);
    const ligne = ecrit.mock.calls.map((c) => String(c[0])).find((l) => l.includes('"suivi":"erreur"'));
    ecrit.mockRestore();
    expect(JSON.parse(ligne!)).toMatchObject({ source: 'navigateur', route: erreur.page, message: erreur.message });
    await request(app.getHttpServer())
      .post('/api/erreurs-client')
      .set('Authorization', `Bearer ${jeton}`)
      .send({ page: '/x' })
      .expect(400);
  });
});
