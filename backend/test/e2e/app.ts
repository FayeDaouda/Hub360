import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { json } from 'express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

export const SLUG = 'grey-concrete';
export const MOT_DE_PASSE = 'changeme123';
export const COMPTES = {
  cio: 'cio.greyconcrete@hub.group',
  ceo: 'ceo.greyconcrete@hub.group',
  cfo: 'cfo.greyconcrete@hub.group',
  dirgc: 'dirgc.greyconcrete@hub.group',
  coo: 'coo.greyconcrete@hub.group',
  salarie: 'rokhaya.ndoye@greyconcrete.hub', // Salarié avec fiche d'équipe
} as const;

// Le serveur comme en production (main.ts) : préfixe /api, validation,
// plafond des corps. Seul le plafond de tentatives est levé (les parcours se
// connectent avec plusieurs comptes dans la même minute).
export async function demarrer(): Promise<INestApplication> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = module.createNestApplication();
  app.use(json({ limit: '30mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

export async function connecter(app: INestApplication, email: string, motDePasse = MOT_DE_PASSE): Promise<string> {
  const r = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, motDePasse, societeSlug: SLUG })
    .expect(200);
  return r.body.access_token;
}

// Requêtes authentifiées sur /api/societes/grey-concrete/…
export function api(app: INestApplication, jeton: string) {
  const s = request(app.getHttpServer());
  const chemin = (c: string) => `/api/societes/${SLUG}${c}`;
  const auth = { Authorization: `Bearer ${jeton}` };
  return {
    get: (c: string) => s.get(chemin(c)).set(auth),
    post: (c: string, corps: object = {}) => s.post(chemin(c)).set(auth).send(corps),
    patch: (c: string, corps: object = {}) => s.patch(chemin(c)).set(auth).send(corps),
    put: (c: string, corps: object = {}) => s.put(chemin(c)).set(auth).send(corps),
    delete: (c: string) => s.delete(chemin(c)).set(auth),
  };
}

// Modèle et signataires FICTIFS, propres à la base de test : la vraie
// configuration attend le contrat type de la société.
export async function parametrerContratDeTest(app: INestApplication) {
  await api(app, await connecter(app, COMPTES.cio))
    .patch('/parametres-contrat', {
      modele: 'Contrat de test — {{client}}',
      signataireNom: 'Signataire Test',
      signataireFonction: 'Architecte DPLG',
      signataireCeoNom: 'CEO Test',
      signataireCeoFonction: 'Directeur général',
    })
    .expect(200);
}

// Dossier en Onboard (offre acceptée) → contrat préparé, annexes sans objet,
// signature papier : le contrat régularise le dossier.
export async function signerContrat(cfo: ReturnType<typeof api>, dossierId: string) {
  const { contrat } = (await cfo.post(`/dossiers/${dossierId}/contrat`).expect(201)).body as {
    contrat: { annexes: { id: string; statut: string }[] };
  };
  for (const a of contrat.annexes.filter((x) => x.statut === 'a_joindre')) {
    await cfo.patch(`/dossiers/${dossierId}/contrat/annexes/${a.id}`, { statut: 'non_necessaire' }).expect(200);
  }
  await cfo
    .post(`/dossiers/${dossierId}/contrat/signature-papier`, {
      nom: 'contrat-signe.pdf',
      url: 'data:application/pdf;base64,JVBERi0xLjQ=',
    })
    .expect(201);
}
