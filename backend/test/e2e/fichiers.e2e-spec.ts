import { INestApplication } from '@nestjs/common';
import { api, COMPTES, connecter, demarrer } from './app';

// Fichiers joints (audit du 24/10/2026, C1) : seule une data URI base64 est
// acceptée. Une URL `javascript:` enregistrée s'exécutait chez la personne
// qui ouvrait le fichier.
describe('Fichiers joints', () => {
  let app: INestApplication;
  let cfo: ReturnType<typeof api>;
  let dossierId: string;

  beforeAll(async () => {
    app = await demarrer();
    cfo = api(app, await connecter(app, COMPTES.cfo));
    dossierId = ((await cfo.get('/dossiers').expect(200)).body as { id: string }[])[0].id;
  });
  afterAll(() => app.close());

  it('une URL javascript: est refusée avant tout traitement', async () => {
    const r = await cfo
      .post(`/dossiers/${dossierId}/contrat/document`, { nom: 'contrat.pdf', url: 'javascript:document.title="x"' })
      .expect(400);
    expect(JSON.stringify(r.body.message)).toContain('Fichier invalide.');
  });

  it('un lien externe est refusé de la même façon', async () => {
    await cfo.post(`/dossiers/${dossierId}/contrat/document`, { nom: 'contrat.pdf', url: 'https://exemple.com/contrat.pdf' }).expect(400);
  });
});
