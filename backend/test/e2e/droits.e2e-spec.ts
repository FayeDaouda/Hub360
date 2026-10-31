import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { api, COMPTES, connecter, demarrer } from './app';

type Matrice = { roles: { id: string; nom: string; droits: Record<string, Record<string, boolean>> }[] };
const TOUT = { lecture: true, ecriture: true, validation: true, suppression: true };
const AUCUN = { lecture: false, ecriture: false, validation: false, suppression: false };

// Parcours — matrice des droits (31/10/2026) : le CIO change un droit, la
// personne concernée est refusée (ou servie) dès sa requête suivante, sans se
// reconnecter, et reçoit un avis « Vos droits ont changé ».
describe('Matrice des droits', () => {
  let app: INestApplication;
  let cio: string;
  let roleCfo: string;
  beforeAll(async () => {
    app = await demarrer();
    cio = await connecter(app, COMPTES.cio);
    const matrice = (await api(app, cio).get('/roles').expect(200)).body as Matrice;
    roleCfo = matrice.roles.find((r) => r.nom === 'CFO')!.id;
  });
  afterAll(async () => {
    // Remis en l'état pour les autres parcours, même si le test échoue en route.
    await api(app, cio).put('/roles/droits', {
      changements: [{ roleId: roleCfo, etapeCle: 'finances_factures', droits: TOUT }],
    });
    await app.close();
  });

  const moi = (jeton: string, chemin: string) =>
    request(app.getHttpServer()).get(`/api/auth/moi${chemin}`).set('Authorization', `Bearer ${jeton}`);

  it('réservée au CIO (et à l’Administrateur HUB) : le CEO et le CFO ne la voient pas', async () => {
    await api(app, await connecter(app, COMPTES.ceo))
      .get('/roles')
      .expect(403);
    await api(app, await connecter(app, COMPTES.cfo))
      .get('/roles')
      .expect(403);
  });

  it('droit retiré : refusé à la requête suivante, avis reçu ; rendu : servi de nouveau', async () => {
    const cfo = await connecter(app, COMPTES.cfo);
    await api(app, cfo).get('/factures').expect(200);

    const apres = await api(app, cio)
      .put('/roles/droits', { changements: [{ roleId: roleCfo, etapeCle: 'finances_factures', droits: AUCUN }] })
      .expect(200);
    expect((apres.body as Matrice).roles.find((r) => r.id === roleCfo)!.droits.finances_factures).toEqual(AUCUN);

    // Même jeton, sans reconnexion.
    await api(app, cfo).get('/factures').expect(403);
    expect((await moi(cfo, '/droits').expect(200)).body.permissions.finances_factures).toBeUndefined();
    const avis = (await moi(cfo, '/avis-droits').expect(200)).body as { message: string }[];
    expect(avis.map((a) => a.message)).toContain(
      'Vos droits ont changé · Finances — Factures : Lecture retirée, Écriture retirée, Validation retirée, Suppression retirée',
    );

    await api(app, cio)
      .put('/roles/droits', { changements: [{ roleId: roleCfo, etapeCle: 'finances_factures', droits: TOUT }] })
      .expect(200);
    await api(app, cfo).get('/factures').expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/moi/avis-droits/compris')
      .set('Authorization', `Bearer ${cfo}`)
      .expect(204);
    expect((await moi(cfo, '/avis-droits').expect(200)).body).toEqual([]);
  });

  it('la ligne du CIO ne se règle pas : carte blanche', async () => {
    const matrice = (await api(app, cio).get('/roles').expect(200)).body as Matrice;
    const roleCio = matrice.roles.find((r) => r.nom === 'CIO')!.id;
    await api(app, cio)
      .put('/roles/droits', { changements: [{ roleId: roleCio, etapeCle: 'crm', droits: AUCUN }] })
      .expect(403);
    await api(app, cio).get('/factures').expect(200);
  });
});
