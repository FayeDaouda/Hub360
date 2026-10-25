import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { hacherMotDePasse } from '../../src/auth/mot-de-passe';
import { PrismaService } from '../../src/prisma/prisma.service';
import * as tenantContext from '../../src/tenancy/tenant-context';
import { runAsSystem, runInCompany, runInGroupScope } from '../../src/tenancy/tenant-context';
import { COMPTES, MOT_DE_PASSE, SLUG, connecter, demarrer } from './app';
import { urlBaseE2e } from './base';

// Isolation entre sociétés (ADR 0001) : le compte d'une autre société, avec
// tous les droits chez elle, ne lit, ne modifie ni ne liste aucune donnée de
// Grey Concrete — y compris en passant l'identifiant exact d'une ligne.
const AUTRE = { slug: 'societe-isolation', email: 'admin.isolation@hub.group' };

describe('Isolation entre sociétés', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let autre: {
    get: (c: string) => request.Test;
    post: (c: string, b?: object) => request.Test;
    patch: (c: string, b?: object) => request.Test;
  };
  let grey: { dossierId: string; devisId: string; factureId: string; projetId: string; clientId: string };
  let autreSocieteId: string;

  beforeAll(async () => {
    app = await demarrer();
    // Explicitement la base de test, jamais celle de backend/.env.
    prisma = new PrismaClient({ datasources: { db: { url: urlBaseE2e() } } });

    // Seconde société, avec le compte « tout voir » d'une société (societe_admin).
    const societe = await prisma.societe.create({ data: { nom: 'Société Isolation', slug: AUTRE.slug } });
    autreSocieteId = societe.id;
    const role = await prisma.role.findFirstOrThrow({ where: { societeId: null, nom: 'societe_admin' } });
    const utilisateur = await prisma.utilisateur.create({
      data: {
        email: AUTRE.email,
        prenom: 'Admin',
        nom: 'Isolation',
        motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE),
      },
    });
    await prisma.utilisateurSocieteRole.create({
      data: { utilisateurId: utilisateur.id, societeId: societe.id, roleId: role.id },
    });

    const greySociete = await prisma.societe.findUniqueOrThrow({ where: { slug: SLUG } });
    const [dossier, devis, facture, projet, client] = await Promise.all([
      prisma.dossierCrm.findFirstOrThrow({ where: { societeId: greySociete.id } }),
      prisma.devis.findFirstOrThrow({ where: { societeId: greySociete.id } }),
      prisma.facture.findFirstOrThrow({ where: { societeId: greySociete.id } }),
      prisma.projet.findFirstOrThrow({ where: { societeId: greySociete.id } }),
      prisma.client.findFirstOrThrow({ where: { societeId: greySociete.id } }),
    ]);
    grey = {
      dossierId: dossier.id,
      devisId: devis.id,
      factureId: facture.id,
      projetId: projet.id,
      clientId: client.id,
    };

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
      const ids = (Array.isArray(r.body) ? r.body : (r.body.lignes ?? r.body.factures ?? [])).map(
        (l: { id: string }) => l.id,
      );
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
    [
      'enregistrer un paiement',
      () =>
        autre.post(`/factures/${grey.factureId}/paiements`, { date: '2026-10-25', montant: 1000, mode: 'virement' }),
    ],
    ['agir sur un dossier CRM', () => autre.post(`/dossiers/${grey.dossierId}/actions`, { action: 'valider' })],
  ])('écriture par identifiant refusée : %s', async (_cas, appel) => {
    const r = await appel();
    expect([403, 404]).toContain(r.status);
  });

  it('les données de Grey Concrete sont intactes', async () => {
    const devis = await prisma.devis.findUniqueOrThrow({ where: { id: grey.devisId } });
    expect(devis.objet).not.toBe('Intrusion');
  });

  it('créer une donnée liée à un client de Grey Concrete est refusé', async () => {
    const r = await autre.post('/devis', {
      clientId: grey.clientId,
      objet: 'Intrusion',
      lignes: [{ designation: 'Mission', quantite: 1, prixUnitaire: 1_000 }],
    });
    expect([403, 404]).toContain(r.status);
    expect(await prisma.devis.count({ where: { objet: 'Intrusion' } })).toBe(0);
  });

  // Seconde barrière, indépendante des filtres écrits dans les services : le
  // client Prisma de l'application ne rend rien d'une autre société, même
  // interrogé directement par identifiant (ADR 0001).
  describe('client Prisma de l’application', () => {
    const client = () => app.get(PrismaService);

    it('ne voit ni ne modifie que la société active', async () => {
      await runInCompany(autreSocieteId, async () => {
        expect(await client().devis.findUnique({ where: { id: grey.devisId } })).toBeNull();
        expect(await client().facture.count({ where: { id: grey.factureId } })).toBe(0);
        const maj = await client().devis.updateMany({ where: { id: grey.devisId }, data: { objet: 'Intrusion' } });
        expect(maj.count).toBe(0);
        await expect(
          client().devis.update({ where: { id: grey.devisId }, data: { objet: 'Intrusion' } }),
        ).rejects.toThrow();
        // Périmètre groupe assumé : la ligne redevient visible.
        expect(await runInGroupScope(() => client().devis.findUnique({ where: { id: grey.devisId } }))).not.toBeNull();
      });
    });

    it('refuse une ligne destinée à une autre société', async () => {
      const greySocieteId = (await prisma.societe.findUniqueOrThrow({ where: { slug: SLUG } })).id;
      await runInCompany(autreSocieteId, async () => {
        await expect(
          client().client.create({ data: { societeId: greySocieteId, nom: 'Intrus', type: 'particulier' } }),
        ).rejects.toThrow('autre société');
      });
    });

    it('refuse une relation vers une donnée d’une autre société (clé étrangère ou connect)', async () => {
      await runInCompany(autreSocieteId, async () => {
        await expect(
          client().devis.create({ data: { societeId: autreSocieteId, clientId: grey.clientId, objet: 'Intrusion' } }),
        ).rejects.toThrow('référence une donnée');
        await expect(
          client().devis.create({
            data: {
              societe: { connect: { id: autreSocieteId } },
              client: { connect: { id: grey.clientId } },
              objet: 'Intrusion',
            },
          }),
        ).rejects.toThrow('référence une donnée');
      });
      expect(await prisma.devis.count({ where: { objet: 'Intrusion' } })).toBe(0);
    });

    it('accepte une relation vers une ligne créée plus tôt dans la même transaction', async () => {
      await runInCompany(autreSocieteId, () =>
        client().$transaction(async (tx) => {
          const nouveau = await tx.client.create({
            data: { societeId: autreSocieteId, nom: 'Client de la transaction', type: 'particulier' },
          });
          await tx.devis.create({
            data: { societeId: autreSocieteId, clientId: nouveau.id, objet: 'Devis de la transaction' },
          });
        }),
      );
      expect(await prisma.devis.count({ where: { societeId: autreSocieteId, objet: 'Devis de la transaction' } })).toBe(
        1,
      );
    });

    it('refuse toute opération sur une donnée de société hors contexte (refus par défaut)', async () => {
      await expect(client().facture.count()).rejects.toThrow('hors de tout contexte');
      // Un modèle sans société (comptes, sociétés) reste lisible.
      expect(await client().societe.count()).toBeGreaterThan(0);
    });

    it('refuse une requête SQL brute hors périmètre système', async () => {
      await runInCompany(autreSocieteId, async () => {
        await expect(client().$queryRaw`SELECT count(*) FROM factures`).rejects.toThrow('SQL brute');
      });
      await expect(client().$queryRawUnsafe('SELECT 1')).rejects.toThrow('SQL brute');
      expect(await runAsSystem('test de requête brute', () => client().$queryRaw`SELECT 1 AS un`)).toEqual([{ un: 1 }]);
    });
  });

  it('chaque requête HTTP s’exécute dans le contexte de la société du jeton, gardes comprises', async () => {
    const espion = jest.spyOn(tenantContext, 'currentTenant');
    try {
      await autre.get('/devis').expect(200);
      // Le contexte est ouvert dès l'entrée de la requête ; la société est
      // identifiée par la stratégie JWT, puis toutes les lectures l'ont.
      const vus = espion.mock.results.map((r) => r.value as { companyId?: string } | undefined);
      expect(vus).not.toContainEqual(undefined);
      const identifiee = vus.findIndex((v) => v?.companyId);
      expect(identifiee).toBeGreaterThanOrEqual(0);
      expect(vus.slice(identifiee)).toEqual(
        vus.slice(identifiee).map(() => ({ scope: 'company', companyId: autreSocieteId })),
      );
    } finally {
      espion.mockRestore();
    }
  });

  it('un jeton de Grey Concrete ne donne pas accès à l’autre société', async () => {
    const jeton = await connecter(app, COMPTES.cfo);
    await request(app.getHttpServer())
      .get(`/api/societes/${AUTRE.slug}/devis`)
      .set({ Authorization: `Bearer ${jeton}` })
      .expect(403);
  });
});
