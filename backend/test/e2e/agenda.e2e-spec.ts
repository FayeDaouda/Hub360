import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

  // Abonnement depuis Google, Apple ou Outlook (12/11/2026) : le lien se lit
  // sans session, porte la réunion de l'invité, et cesse de marcher une fois
  // régénéré ou supprimé.
  it('abonnement : lu sans session, régénéré puis supprimé', async () => {
    const dirgc = await connecter(app, COMPTES.dirgc);
    const cfo = await connecter(app, COMPTES.cfo);
    const jour = addDays(todayIso(), 2);
    const cfoId = ((await api(app, cfo).get(`/agenda?du=${jour}`).expect(200)).body as Semaine).personne.id;
    const { id } = (
      await api(app, dirgc)
        .post('/agenda', {
          titre: 'Point budget',
          debut: `${jour}T09:00:00.000Z`,
          fin: `${jour}T09:30:00.000Z`,
          inviteIds: [cfoId],
        })
        .expect(201)
    ).body as { id: string };

    const { url } = (await api(app, cfo).post('/agenda/abonnement').expect(201)).body as { url: string };
    const chemin = new URL(url).pathname;
    expect(chemin).toMatch(/^\/api\/agenda-abonnement\/[A-Za-z0-9_-]{43}\.ics$/);
    const flux = await request(app.getHttpServer()).get(chemin).expect(200);
    expect(flux.headers['content-type']).toContain('text/calendar');
    expect(flux.text).toContain(`UID:rdv-${id}@hub360.space`);
    expect(flux.text).toContain('SUMMARY:Point budget');
    const etat = (await api(app, cfo).get('/agenda/abonnement').expect(200)).body as {
      actif: boolean;
      dernierAccesLe: string | null;
    };
    expect(etat.actif).toBe(true);
    expect(etat.dernierAccesLe).not.toBeNull();

    // Jeton inconnu ou malformé : la même réponse.
    await request(app.getHttpServer()).get('/api/agenda-abonnement/inconnu.ics').expect(404);
    await request(app.getHttpServer())
      .get(`/api/agenda-abonnement/${'a'.repeat(43)}.ics`)
      .expect(404);

    const { url: nouveau } = (await api(app, cfo).post('/agenda/abonnement').expect(201)).body as { url: string };
    await request(app.getHttpServer()).get(chemin).expect(404);
    await request(app.getHttpServer()).get(new URL(nouveau).pathname).expect(200);
    await api(app, cfo).delete('/agenda/abonnement').expect(200);
    await request(app.getHttpServer()).get(new URL(nouveau).pathname).expect(404);
    expect(((await api(app, cfo).get('/agenda/abonnement').expect(200)).body as { actif: boolean }).actif).toBe(false);

    await api(app, dirgc).delete(`/agenda/${id}`).expect(200);
  });

  // Modifier une réunion (12/11/2026) : l'organisateur seul ; l'invité gardé
  // voit la nouvelle heure, l'invité retiré ne la voit plus.
  it('modifier : nouvelle heure pour l’invité gardé, disparue pour le retiré', async () => {
    const dirgc = await connecter(app, COMPTES.dirgc);
    const cfo = await connecter(app, COMPTES.cfo);
    const coo = await connecter(app, COMPTES.coo);
    const jour = addDays(todayIso(), 3);
    const idDe = async (j: string) =>
      ((await api(app, j).get(`/agenda?du=${jour}`).expect(200)).body as Semaine).personne.id;
    const [cfoId, cooId] = [await idDe(cfo), await idDe(coo)];
    const { id } = (
      await api(app, dirgc)
        .post('/agenda', {
          titre: 'Revue',
          debut: `${jour}T10:00:00.000Z`,
          fin: `${jour}T11:00:00.000Z`,
          inviteIds: [cfoId, cooId],
        })
        .expect(201)
    ).body as { id: string };

    const nouvelle = { titre: 'Revue décalée', debut: `${jour}T15:00:00.000Z`, fin: `${jour}T16:00:00.000Z` };
    await api(app, cfo)
      .patch(`/agenda/${id}`, { ...nouvelle, inviteIds: [cfoId] })
      .expect(403);
    await api(app, dirgc)
      .patch(`/agenda/${id}`, { ...nouvelle, inviteIds: [cfoId] })
      .expect(200);

    type Vu = Semaine['elements'][number] & { debut: string; modifiable: boolean };
    const chezCfo = ((await api(app, cfo).get(`/agenda?du=${jour}`).expect(200)).body as { elements: Vu[] }).elements;
    expect(chezCfo.find((e) => e.id === id)).toMatchObject({
      titre: 'Revue décalée',
      debut: `${jour}T15:00:00.000Z`,
      modifiable: false,
    });
    const chezCoo = (await api(app, coo).get(`/agenda?du=${jour}`).expect(200)).body as Semaine;
    expect(chezCoo.elements.some((e) => e.id === id)).toBe(false);
    const chezDirgc = ((await api(app, dirgc).get(`/agenda?du=${jour}`).expect(200)).body as { elements: Vu[] })
      .elements;
    expect(chezDirgc.find((e) => e.id === id)?.modifiable).toBe(true);

    await api(app, dirgc).delete(`/agenda/${id}`).expect(200);
  });

  // B3 (12/11/2026) : réponse de l'invité, disponibilités, visio et rappel.
  it('répondre, voir les réponses et qui est occupé ; visio en https seulement', async () => {
    const dirgc = await connecter(app, COMPTES.dirgc);
    const cfo = await connecter(app, COMPTES.cfo);
    const jour = addDays(todayIso(), 4);
    const cfoId = ((await api(app, cfo).get(`/agenda?du=${jour}`).expect(200)).body as Semaine).personne.id;
    const base = { titre: 'Comité', debut: `${jour}T08:00:00.000Z`, fin: `${jour}T09:00:00.000Z`, inviteIds: [cfoId] };
    await api(app, dirgc)
      .post('/agenda', { ...base, lienVisio: 'http://meet.example.com/x' })
      .expect(400);
    const { id } = (
      await api(app, dirgc)
        .post('/agenda', { ...base, lienVisio: 'https://meet.google.com/abc-defg-hij', rappelMinutes: 30 })
        .expect(201)
    ).body as { id: string };

    await api(app, cfo).put(`/agenda/${id}/reponse`, { reponse: 'peut_etre' }).expect(200);
    await api(app, dirgc).put(`/agenda/${id}/reponse`, { reponse: 'oui' }).expect(404); // pas invité

    type Vu = { id: string; participants: { nom: string; reponse: string | null }[]; maReponse: string | null };
    const chezDirgc = ((await api(app, dirgc).get(`/agenda?du=${jour}`).expect(200)).body as { elements: Vu[] })
      .elements;
    expect(chezDirgc.find((e) => e.id === id)?.participants).toEqual([
      expect.objectContaining({ reponse: 'peut_etre' }),
    ]);
    const chezCfo = ((await api(app, cfo).get(`/agenda?du=${jour}`).expect(200)).body as { elements: Vu[] }).elements;
    expect(chezCfo.find((e) => e.id === id)).toMatchObject({ maReponse: 'peut_etre' });

    const dispo = (
      await api(app, dirgc)
        .get(`/agenda/disponibilites?debut=${jour}T08:30:00.000Z&fin=${jour}T09:30:00.000Z&ids=${cfoId}`)
        .expect(200)
    ).body as { occupes: string[] };
    expect(dispo.occupes).toContain(cfoId);
    const sansLui = (
      await api(app, dirgc)
        .get(`/agenda/disponibilites?debut=${jour}T08:30:00.000Z&fin=${jour}T09:30:00.000Z&ids=${cfoId}&exclure=${id}`)
        .expect(200)
    ).body as { occupes: string[] };
    expect(sansLui.occupes).not.toContain(cfoId);

    await api(app, dirgc).delete(`/agenda/${id}`).expect(200);
  });
});
