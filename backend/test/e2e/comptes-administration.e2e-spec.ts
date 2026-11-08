import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { runAsSystem } from '../../src/tenancy/tenant-context';
import { api, COMPTES, connecter, demarrer } from './app';

// Administration du HUB › Comptes : les comptes d'administration (comptes de
// secours, Administrateur HUB) ne se gèrent pas depuis l'écran. Le serveur
// refuse aussi le retrait de la double authentification, le déblocage et le
// renvoi d'invitation (08/11/2026) — comme il refusait déjà le rôle,
// l'activation, les sessions et le lien de mot de passe. Sa propre double
// authentification non plus.
describe('Comptes d’administration hors de portée de l’Administration du HUB', () => {
  let app: INestApplication;
  let cio: string;
  type Compte = { id: string; email: string; administration: boolean };
  let comptes: Compte[];

  beforeAll(async () => {
    app = await demarrer();
    cio = await connecter(app, COMPTES.cio);
    const liste = await request(app.getHttpServer())
      .get('/api/groupe/comptes')
      .set('Authorization', `Bearer ${cio}`)
      .expect(200);
    comptes = (liste.body.societes as { comptes: Compte[] }[]).flatMap((s) => s.comptes);
  });
  afterAll(() => app.close());

  const poster = (chemin: string) =>
    request(app.getHttpServer()).post(`/api/groupe/comptes/${chemin}`).set('Authorization', `Bearer ${cio}`);

  // Ce que les trois actions écriraient : double authentification, verrou,
  // date de coupure des sessions, et la trace au journal du compte.
  const etat = (id: string) =>
    runAsSystem('test : état d’un compte d’administration', async () => {
      const prisma = app.get(PrismaService);
      const u = await prisma.utilisateur.findUniqueOrThrow({
        where: { id },
        select: { totpActifLe: true, verrouilleJusquau: true, sessionsValidesDepuis: true },
      });
      return { ...u, evenements: await prisma.evenementCompte.count({ where: { utilisateurId: id } }) };
    });

  it('double authentification, déblocage, invitation sur un compte d’administration : 409, et rien ne change en base', async () => {
    const admin = comptes.find((c) => c.administration);
    expect(admin).toBeDefined();
    const avant = await etat(admin!.id);
    for (const action of ['double-facteur/reinitialisation', 'deblocage', 'invitation']) {
      const r = await poster(`${admin!.id}/${action}`).expect(409);
      expect(r.body.message).toBe("Compte d'administration : il ne se gère pas depuis cet écran.");
    }
    expect(await etat(admin!.id)).toEqual(avant);
  });

  it('RH : un dossier du personnel ne se relie pas à un compte d’administration (409, aucun dossier créé)', async () => {
    const admin = comptes.find((c) => c.administration);
    const rh = api(app, await connecter(app, COMPTES.rh));
    const avant = ((await rh.get('/rh/dossiers').expect(200)).body as unknown[]).length;
    const societeId = (
      (await request(app.getHttpServer()).get('/api/groupe/comptes').set('Authorization', `Bearer ${cio}`).expect(200))
        .body.societes as { id: string; slug: string }[]
    ).find((s) => s.slug === 'grey-concrete')!.id;
    const r = await rh
      .post('/rh/dossiers', { societeId, utilisateurId: admin!.id, prenom: 'Essai', nom: 'Secours' })
      .expect(409);
    expect(r.body.message).toBe("Un compte d'administration ne se relie pas à un dossier du personnel.");
    expect(((await rh.get('/rh/dossiers').expect(200)).body as unknown[]).length).toBe(avant);
  });

  it('sa propre double authentification : 409', async () => {
    const moi = comptes.find((c) => c.email === COMPTES.cio);
    const r = await poster(`${moi!.id}/double-facteur/reinitialisation`).expect(409);
    expect(r.body.message).toBe('Votre propre double authentification ne se retire pas depuis cet écran.');
  });

  it('un compte ordinaire non verrouillé : le refus métier habituel, pas celui des comptes d’administration', async () => {
    const ordinaire = comptes.find((c) => c.email === COMPTES.cfo);
    const r = await poster(`${ordinaire!.id}/deblocage`).expect(409);
    expect(r.body.message).toBe('Ce compte n’est pas verrouillé.');
  });
});
