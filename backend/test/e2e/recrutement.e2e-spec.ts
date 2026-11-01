import { INestApplication } from '@nestjs/common';
import { addDays, todayIso } from '@hub/domain';
import { api, COMPTES, connecter, demarrer } from './app';

type Vue = { postes: { id: string; statut: string }[] };
type Candidat = { id: string; etape: string; dossierId: string | null };

// Recrutement (lot 13, 01/11/2026) : demande du Dir. GC, approbation du CEO,
// candidat saisi par la RH, entretien, embauche → dossier du personnel.
describe('Recrutement', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await demarrer();
  });
  afterAll(() => app.close());

  it('du poste demandé à l’embauche, chaque geste par sa case', async () => {
    const dirgc = await connecter(app, COMPTES.dirgc);
    const ceo = await connecter(app, COMPTES.ceo);
    const rh = await connecter(app, COMPTES.rh);
    const cfo = await connecter(app, COMPTES.cfo);

    const { id: posteId, statut } = (
      await api(app, dirgc).post('/recrutement/postes', { intitule: 'Architecte junior' }).expect(201)
    ).body as { id: string; statut: string };
    expect(statut).toBe('a_approuver');
    await api(app, rh).post(`/recrutement/postes/${posteId}/decision`, { accepter: true }).expect(403);
    await api(app, ceo).post(`/recrutement/postes/${posteId}/decision`, { accepter: true }).expect(200);

    const { id } = (
      await api(app, rh).post(`/recrutement/postes/${posteId}/candidats`, { prenom: 'Awa', nom: 'Ndiaye' }).expect(201)
    ).body as { id: string };
    await api(app, rh)
      .post(`/recrutement/candidats/${id}/notes`, { note: 'Bon portfolio', entretien: true })
      .expect(200);
    await api(app, cfo)
      .post(`/recrutement/candidats/${id}/decision`, { embaucher: true, dateEntree: addDays(todayIso(), 30) })
      .expect(403);
    await api(app, rh)
      .post(`/recrutement/candidats/${id}/decision`, { embaucher: true, dateEntree: addDays(todayIso(), 30) })
      .expect(200);

    const [candidat] = (await api(app, rh).get(`/recrutement/postes/${posteId}/candidats`).expect(200))
      .body as Candidat[];
    expect(candidat).toMatchObject({ etape: 'embauche' });
    expect(candidat.dossierId).toBeTruthy();
    expect(
      ((await api(app, rh).get('/recrutement').expect(200)).body as Vue).postes.find((p) => p.id === posteId)?.statut,
    ).toBe('pourvu');
  });
});
