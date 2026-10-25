import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { hacherMotDePasse } from '../../src/auth/mot-de-passe';
import { PrismaService } from '../../src/prisma/prisma.service';
import * as tenantContext from '../../src/tenancy/tenant-context';
import { runInGroupScope, runInTenant } from '../../src/tenancy/tenant-context';
import { COMPTES, MOT_DE_PASSE, SLUG, connecter, demarrer } from './app';

// Isolation entre sociétés (ADR 0001) : le compte d'une autre société, avec
// tous les droits chez elle, ne lit, ne modifie ni ne liste aucune donnée de
// Grey Concrete — y compris en passant l'identifiant exact d'une ligne.
const AUTRE = { slug: 'societe-isolation', email: 'admin.isolation@hub.group' };

describe('Isolation entre sociétés', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let autre: { get: (c: string) => request.Test; post: (c: string, b?: object) => request.Test; patch: (c: string, b?: object) => request.Test };
  let grey: { dossierId: string; devisId: string; factureId: string; projetId: string };
  let autreSocieteId: string;

  beforeAll(async () => {
    app = await demarrer();
    prisma = new PrismaClient();

    // Seconde société, avec le compte « tout voir » d'une société (societe_admin).
    const societe = await prisma.societe.create({ data: { nom: 'Société Isolation', slug: AUTRE.slug } });
    autreSocieteId = societe.id;
    const role = await prisma.role.findFirstOrThrow({ where: { societeId: null, nom: 'societe_admin' } });
    const utilisateur = await prisma.utilisateur.create({
      data: { email: AUTRE.email, prenom: 'Admin', nom: 'Isolation', motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE) },
    });
    await prisma.utilisateurSocieteRole.create({ data: { utilisateurId: utilisateur.id, societeId: societe.id, roleId: role.id } });

    const greySociete = await prisma.societe.findUniqueOrThrow({ where: { slug: SLUG } });
    const [dossier, devis, facture, projet] = await Promise.all([
      prisma.dossierCrm.findFirstOrThrow({ where: { societeId: greySociete.id } }),
      prisma.devis.findFirstOrThrow({ where: { societeId: greySociete.id } }),
      prisma.facture.findFirstOrThrow({ where: { societeId: greySociete.id } }),
      prisma.projet.findFirstOrThrow({ where: { societeId: greySociete.id } }),
    ]);
    grey = { dossierId: dossier.id, devisId: devis.id, factureId: facture.id, projetId: projet.id };

    const r = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: AUTRE.email, motDePasse: MOT_DE_PASSE, societeSlug: AUTRE.slug })
      .expect(200);
    const auth = { Authorization: `Bearer ${r.body.access_token}` };
    const s = request(app.getHttpServer());
    const chemin = (c: string) => `/api/societes/${AUTRE.slug}${c}`;
    autre = {
      get: (c) => s.get(chemin(c)).set(auth),
      post: (c, b = {}) => s.post(chemin(c)).set(auth).send(b),
      patch: (c, b = {}) => s.patch(chemin(c)).set(auth).send(b),
    };
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('ses listes ne contiennent aucune donnée de Grey Concrete', async () => {
    for (const [route, id] of [
      ['/dossiers', grey.dossierId],
      ['/devis', grey.devisId],
      ['/factures', grey.factureId],
    ] as const) {
      const r = await autre.get(route).expect(200);
      const ids = (Array.isArray(r.body) ? r.body : (r.body.lignes ?? r.body.factures ?? [])).map((l: { id: string }) => l.id);
      expect(ids).not.toContain(id);
    }
  });

  it.each([
    ['devis', () => `/devis/${grey.devisId}`],
    ['facture', () => `/factures/${grey.factureId}`],
    ['historique d’un dossier', () => `/dossiers/${grey.dossierId}/historique`],
    ['contrat d’un dossier', () => `/dossiers/${grey.dossierId}/contrat`],
    ['factures d’un projet', () => `/projets/${grey.projetId}/factures`],
    ['projet ouvert', () => `/projets-ouverts/${grey.projetId}`],
    ['rentabilité d’un projet', () => `/finances/rentabilite/projets/${grey.projetId}`],
    ['coordonnées d’apporteur', () => `/commissions/coordonnees/${grey.dossierId}`],
    ['feuille de temps d’un dossier', () => `/finances/feuille-temps/${grey.dossierId}`],
  ])('lecture par identifiant refusée : %s', async (_cas, route) => {
    const r = await autre.get(route());
    expect([403, 404]).toContain(r.status);
  });

  it.each([
    ['modifier un devis', () => autre.patch(`/devis/${grey.devisId}`, { objet: 'Intrusion' })],
    ['enregistrer un paiement', () => autre.post(`/factures/${grey.factureId}/paiements`, { date: '2026-10-25', montant: 1000, mode: 'virement' })],
    ['agir sur un dossier CRM', () => autre.post(`/dossiers/${grey.dossierId}/actions`, { action: 'valider' })],
  ])('écriture par identifiant refusée : %s', async (_cas, appel) => {
    const r = await appel();
    expect([403, 404]).toContain(r.status);
  });

  it('les données de Grey Concrete sont intactes', async () => {
    const devis = await prisma.devis.findUniqueOrThrow({ where: { id: grey.devisId } });
    expect(devis.objet).not.toBe('Intrusion');
  });

  // Seconde barrière, indépendante des filtres écrits dans les services : le
  // client Prisma de l'application ne rend rien d'une autre société, même
  // interrogé directement par identifiant (ADR 0001).
  it('le client Prisma de l’application ne voit que la société active', async () => {
    const client = app.get(PrismaService);
    const tenant = { companyId: autreSocieteId, scope: 'company' as const };
    await runInTenant(tenant, async () => {
      expect(await client.devis.findUnique({ where: { id: grey.devisId } })).toBeNull();
      expect(await client.facture.count({ where: { id: grey.factureId } })).toBe(0);
      const maj = await client.devis.updateMany({ where: { id: grey.devisId }, data: { objet: 'Intrusion' } });
      expect(maj.count).toBe(0);
      await expect(client.devis.update({ where: { id: grey.devisId }, data: { objet: 'Intrusion' } })).rejects.toThrow();
      await expect(client.client.create({ data: { societeId: (await prisma.societe.findUniqueOrThrow({ where: { slug: SLUG } })).id, nom: 'Intrus', type: 'particulier' } })).rejects.toThrow(
        'autre société',
      );
      // Périmètre groupe assumé : la ligne redevient visible.
      expect(await runInGroupScope(() => client.devis.findUnique({ where: { id: grey.devisId } }))).not.toBeNull();
    });
  });

  it('chaque requête HTTP s’exécute dans le contexte de la société du jeton', async () => {
    const espion = jest.spyOn(tenantContext, 'currentTenant');
    try {
      await autre.get('/devis').expect(200);
      // Les gardes passent avant l'intercepteur (sans contexte, ils vérifient la
      // société eux-mêmes) ; toutes les requêtes du handler, ensuite, l'ont.
      const vus = espion.mock.results.map((r) => r.value);
      const premierAvecContexte = vus.findIndex((v) => v !== undefined);
      expect(premierAvecContexte).toBeGreaterThanOrEqual(0);
      expect(vus.slice(premierAvecContexte)).toEqual(vus.slice(premierAvecContexte).map(() => ({ companyId: autreSocieteId, scope: 'company' })));
    } finally {
      espion.mockRestore();
    }
  });

  it('un jeton de Grey Concrete ne donne pas accès à l’autre société', async () => {
    const jeton = await connecter(app, COMPTES.cfo);
    await request(app.getHttpServer()).get(`/api/societes/${AUTRE.slug}/devis`).set({ Authorization: `Bearer ${jeton}` }).expect(403);
  });
});
