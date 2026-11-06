import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { formatTime } from '@hub/domain';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { runAsSystem } from '../../src/tenancy/tenant-context';
import { api, COMPTES, connecter, demarrer, MOT_DE_PASSE, SLUG } from './app';

// Contenu d'un jeton (dates en secondes), lu sans vérifier la signature.
const contenu = (jeton: string) => JSON.parse(Buffer.from(jeton.split('.')[1], 'base64url').toString());

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
    // Quatre droits en lettres (31/10/2026) : Lecture, Écriture, Validation, Suppression.
    expect(r.body.permissions.finances_factures).toBe('LEVS');
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
    // Même début de session : changer de mot de passe ne repousse pas les 12 h.
    expect(contenu(r.body.access_token).debut).toBe(contenu(ancienne).debut);
    // Remis en l'état pour les autres parcours.
    await request(app.getHttpServer())
      .post('/api/auth/mot-de-passe')
      .set('Authorization', `Bearer ${r.body.access_token}`)
      .send({ actuel: 'NouveauMotDePasse2026!', nouveau: MOT_DE_PASSE })
      .expect(200);
  });
});

// Durée des sessions (décision du 28/10/2026, lot B) : 12 h au plus ;
// inactivité 1 h pour CEO, CFO, CIO et RH, 4 h pour les autres.
describe('Durée des sessions', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await demarrer();
  });
  afterAll(() => app.close());

  const prolonger = (jeton: string) =>
    request(app.getHttpServer()).post('/api/auth/moi/prolongation').set('Authorization', `Bearer ${jeton}`);

  it('la session commence à la connexion ; le jeton vaut 1 h pour le CFO, 4 h pour le Salarié', async () => {
    const cfo = contenu(await connecter(app, COMPTES.cfo));
    expect(cfo.debut).toBe(cfo.iat);
    expect(cfo.exp - cfo.iat).toBe(3600);
    const salarie = contenu(await connecter(app, COMPTES.salarie));
    expect(salarie.exp - salarie.iat).toBe(4 * 3600);
  });

  it('la prolongation rend un jeton valable, sur le même début de session', async () => {
    const jeton = await connecter(app, COMPTES.dirgc);
    const r = await prolonger(jeton).expect(200);
    await api(app, r.body.access_token).get('/dossiers').expect(200);
    const avant = contenu(jeton);
    const apres = contenu(r.body.access_token);
    expect(apres).toMatchObject({
      sub: avant.sub,
      role: avant.role,
      permissions: avant.permissions,
      debut: avant.debut,
    });
    expect(apres.exp).toBeGreaterThanOrEqual(avant.exp);
  });

  it('au-delà de 12 h depuis la connexion : refusée, même avec un jeton encore valable', async () => {
    const { sub, email, societeId, societeSlug, role, permissions } = contenu(await connecter(app, COMPTES.cio));
    const maintenant = Math.floor(Date.now() / 1000);
    // Jeton bien signé et non expiré, mais d'une session ouverte il y a 12 h.
    const jeton = app
      .get(JwtService)
      .sign(
        { sub, email, societeId, societeSlug, role, permissions, iat: maintenant, debut: maintenant - 12 * 3600 },
        { expiresIn: 3600 },
      );
    const r = await api(app, jeton).get('/dossiers').expect(401);
    expect(r.body.message).toBe('Session expirée — reconnecte-toi.');
    await prolonger(jeton).expect(401);
  });
});

// Verrouillage (décision du 28/10/2026, lot C) : 10 essais infructueux, 15 min
// au premier verrouillage ; déblocage par le CIO.
describe('Verrouillage du compte', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await demarrer();
  });
  // Même si le test échoue en route : le compte ne reste pas verrouillé pour
  // les parcours suivants, qui partagent la base.
  afterAll(async () => {
    await runAsSystem('test : compte rendu à son état initial', () =>
      app.get(PrismaService).utilisateur.update({
        where: { email: COMPTES.ceo },
        data: { echecsConnexion: 0, verrouillages: 0, verrouilleJusquau: null },
      }),
    );
    await app.close();
  });

  const essai = (motDePasse: string) =>
    request(app.getHttpServer()).post('/api/auth/login').send({ email: COMPTES.ceo, motDePasse, societeSlug: SLUG });

  it('verrouillé au dixième essai infructueux, même avec le bon mot de passe ; le CIO débloque', async () => {
    for (let i = 0; i < 9; i++) await essai('mauvais-mot-de-passe').expect(401);
    const verrou = await essai('mauvais-mot-de-passe').expect(423);
    expect(verrou.body.message).toContain('Le CIO peut le débloquer');
    await essai(MOT_DE_PASSE).expect(423);

    const cio = await connecter(app, COMPTES.cio);
    const groupe = request(app.getHttpServer());
    const liste = await groupe.get('/api/groupe/comptes').set('Authorization', `Bearer ${cio}`).expect(200);
    const compte = (liste.body.societes as { comptes: { id: string; email: string; verrouilleJusquau: string }[] }[])
      .flatMap((s) => s.comptes)
      .find((c) => c.email === COMPTES.ceo);
    expect(verrou.body.message).toContain(`jusqu’à ${formatTime(compte?.verrouilleJusquau ?? '')}`);
    await groupe.post(`/api/groupe/comptes/${compte?.id}/deblocage`).set('Authorization', `Bearer ${cio}`).expect(201);
    await essai(MOT_DE_PASSE).expect(200);
  });
});
