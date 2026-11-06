import { INestApplication } from '@nestjs/common';
import { addDays, todayIso } from '@hub/domain';
import { api, COMPTES, connecter, demarrer } from './app';

type Semaine = {
  personne: { id: string };
  elements: { id: string; titre: string; type: string; annulable: boolean }[];
};

// Agenda (lot 11, 01/11/2026) : une réunion créée par le Dir. GC apparaît
// chez l'invité ; l'agenda d'un collègue est fermé sans sa case ; seul
// l'organisateur annule.
describe('Agenda', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await demarrer();
  });
  afterAll(() => app.close());

  it('réunion : créée, vue par l’invité, annulée par l’organisateur seulement', async () => {
    const dirgc = await connecter(app, COMPTES.dirgc);
    const cfo = await connecter(app, COMPTES.cfo);
    const jour = addDays(todayIso(), 1);
    const cfoId = ((await api(app, cfo).get(`/agenda?du=${jour}`).expect(200)).body as Semaine).personne.id;
    const { id } = (
      await api(app, dirgc)
        .post('/agenda', {
          titre: 'Revue du projet',
          debut: `${jour}T10:00:00.000Z`,
          fin: `${jour}T11:00:00.000Z`,
          inviteIds: [cfoId],
        })
        .expect(201)
    ).body as { id: string };

    const chezCfo = (await api(app, cfo).get(`/agenda?du=${jour}`).expect(200)).body as Semaine;
    expect(chezCfo.elements.find((e) => e.id === id)).toMatchObject({ titre: 'Revue du projet', annulable: false });

    // Agenda des autres : fermé au CFO, ouvert au CIO (carte blanche).
    const dirgcId = ((await api(app, dirgc).get(`/agenda?du=${jour}`).expect(200)).body as Semaine).personne.id;
    await api(app, cfo).get(`/agenda?du=${jour}&personne=${dirgcId}`).expect(403);
    await api(app, await connecter(app, COMPTES.cio))
      .get(`/agenda?du=${jour}&personne=${dirgcId}`)
      .expect(200);

    await api(app, cfo).delete(`/agenda/${id}`).expect(403);
    await api(app, dirgc).delete(`/agenda/${id}`).expect(200);
    const apres = (await api(app, cfo).get(`/agenda?du=${jour}`).expect(200)).body as Semaine;
    expect(apres.elements.some((e) => e.id === id)).toBe(false);
  });
});
