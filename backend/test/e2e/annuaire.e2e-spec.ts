import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { hacherMotDePasse } from '../../src/auth/mot-de-passe';
import { COMPTES, MOT_DE_PASSE, SLUG, api, connecter, demarrer } from './app';
import { urlBaseE2e } from './base';

// Annuaire (22/11/2026) : périmètre réglable par le CIO / l'Administrateur
// HUB ; les autres sociétés n'entrent que par ce réglage ; jamais que des
// champs d'annuaire.
const AUTRE = { slug: 'societe-annuaire', nom: 'Société Annuaire' };

describe('Annuaire', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ids: { cfo: string; salarie: string };

  beforeAll(async () => {
    app = await demarrer();
    prisma = new PrismaClient({ datasources: { db: { url: urlBaseE2e() } } });
    const societe = await prisma.societe.create({ data: { nom: AUTRE.nom, slug: AUTRE.slug } });
    // Ses propres rôles (comme toute société) : le test ne dépend d'aucun
    // rôle créé par d'autres suites.
    const role = (nom: string) => prisma.role.create({ data: { nom, societeId: societe.id } });
    const [cfo, salarie] = await Promise.all([role('CFO'), role('Salarié')]);
    const hash = await hacherMotDePasse(MOT_DE_PASSE);
    const creer = async (email: string, prenom: string, roleId: string) => {
      const u = await prisma.utilisateur.create({ data: { email, prenom, nom: 'Annuaire', motDePasseHash: hash } });
      await prisma.utilisateurSocieteRole.create({ data: { utilisateurId: u.id, societeId: societe.id, roleId } });
      return u.id;
    };
    ids = {
      cfo: await creer('cfo.annuaire@hub.group', 'Directrice', cfo.id),
      salarie: await creer('salarie.annuaire@hub.group', 'Employe', salarie.id),
    };
  });

  afterAll(async () => {
    await prisma.reglageSociete.deleteMany({ where: { cle: 'annuaire_perimetre' } });
    await prisma.$disconnect();
    await app.close();
  });

  const lister = async (jeton: string) =>
    (await api(app, jeton).get('/annuaire/collegues').expect(200)).body as {
      perimetre: string;
      societes: { slug: string }[];
      membres: Record<string, unknown>[];
    };

  it('par défaut : la société seulement, et seulement des champs d’annuaire', async () => {
    const a = await lister(await connecter(app, COMPTES.salarie));
    expect(a.perimetre).toBe('societe');
    expect(a.societes.map((s) => s.slug)).toEqual([SLUG]);
    expect(a.membres.map((m) => m.utilisateurId)).not.toContain(ids.cfo);
    // Aucun champ RH hors annuaire (salaire, adresse, naissance…).
    const cles = new Set(a.membres.flatMap((m) => Object.keys(m)));
    for (const interdit of ['salaire', 'adresse', 'dateNaissance', 'motDePasseHash', 'type', 'motif']) {
      expect(cles.has(interdit)).toBe(false);
    }
  });

  it('régler le périmètre : réservé au CIO et à l’Administrateur HUB, motivé, tracé au journal', async () => {
    const salarie = await connecter(app, COMPTES.salarie);
    await api(app, salarie).put('/annuaire/perimetre', { perimetre: 'groupe', motif: 'Essai' }).expect(403);
    const cio = await connecter(app, COMPTES.cio);
    await api(app, cio).put('/annuaire/perimetre', { perimetre: 'groupe' }).expect(400); // motif obligatoire
    await api(app, cio).put('/annuaire/perimetre', { perimetre: 'autre', motif: 'Essai' }).expect(400);
    await api(app, cio)
      .put('/annuaire/perimetre', { perimetre: 'societe_direction', motif: 'Contacts de direction' })
      .expect(200);
    expect((await api(app, cio).get('/annuaire/perimetre').expect(200)).body).toEqual({
      perimetre: 'societe_direction',
    });
    const trace = await prisma.interventionHub.findFirstOrThrow({
      where: { type: 'annuaire_perimetre' },
      orderBy: { createdAt: 'desc' },
    });
    expect(trace).toMatchObject({ motif: 'Contacts de direction', detail: expect.stringContaining('direction') });
  });

  it('société + direction : la directrice de l’autre société, pas son salarié ; tout le groupe : les deux', async () => {
    const salarie = await connecter(app, COMPTES.salarie);
    let a = await lister(salarie);
    const autres = a.membres.filter((m) => (m.societe as { slug: string }).slug === AUTRE.slug);
    expect(autres.map((m) => m.utilisateurId)).toEqual([ids.cfo]);
    expect(autres[0]).toMatchObject({ memeSociete: false });

    const cio = await connecter(app, COMPTES.cio);
    await api(app, cio).put('/annuaire/perimetre', { perimetre: 'groupe', motif: 'Tout le groupe' }).expect(200);
    a = await lister(salarie);
    expect(a.membres.map((m) => m.utilisateurId)).toEqual(expect.arrayContaining([ids.cfo, ids.salarie]));
    expect(a.societes.map((s) => s.slug)).toEqual([SLUG, AUTRE.slug]);
  });

  it('le réglage d’une société ne vaut que pour elle', async () => {
    // Grey Concrete s'est ouverte au groupe ; l'autre société garde son
    // périmètre par défaut : ses comptes ne voient pas Grey Concrete.
    const r = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'salarie.annuaire@hub.group', motDePasse: MOT_DE_PASSE, societeSlug: AUTRE.slug })
      .expect(200);
    const a = (
      await request(app.getHttpServer())
        .get(`/api/societes/${AUTRE.slug}/annuaire/collegues`)
        .set('Authorization', `Bearer ${r.body.access_token}`)
        .expect(200)
    ).body as { perimetre: string; societes: { slug: string }[]; membres: { societe: { slug: string } }[] };
    expect(a.perimetre).toBe('societe');
    expect(a.societes.map((x) => x.slug)).toEqual([AUTRE.slug]);
    expect(a.membres.every((m) => m.societe.slug === AUTRE.slug)).toBe(true);
  });
});
