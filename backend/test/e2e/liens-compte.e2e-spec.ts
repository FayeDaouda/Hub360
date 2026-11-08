import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { genererJeton } from '../../src/auth/jetons';
import { PrismaService } from '../../src/prisma/prisma.service';
import { runAsSystem } from '../../src/tenancy/tenant-context';
import { COMPTES, connecter, demarrer } from './app';

// Un lien encore valable ne rallume pas un compte coupé (08/11/2026) : la
// désactivation annule les liens en attente, et un lien de nouveau mot de
// passe est refusé sur un compte désactivé — même réponse qu'un lien expiré.
describe('Liens de compte et départ', () => {
  let app: INestApplication;
  let cio: string;
  let compteId: string;

  const groupe = () => request(app.getHttpServer());
  const actif = (valeur: boolean) =>
    groupe().put(`/api/groupe/comptes/${compteId}/actif`).set('Authorization', `Bearer ${cio}`).send({ actif: valeur });

  // Lien de nouveau mot de passe émis pour le compte (comme « mot de passe
  // oublié », dont l'e-mail n'est pas lisible ici).
  const emettreLien = () =>
    runAsSystem('test : lien de nouveau mot de passe', async () => {
      const { clair, hash } = genererJeton();
      await app.get(PrismaService).invitation.create({
        data: {
          tokenHash: hash,
          type: 'reset',
          email: COMPTES.salarie,
          utilisateurId: compteId,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      return clair;
    });

  beforeAll(async () => {
    app = await demarrer();
    cio = await connecter(app, COMPTES.cio);
    const liste = await groupe().get('/api/groupe/comptes').set('Authorization', `Bearer ${cio}`).expect(200);
    compteId = (liste.body.societes as { comptes: { id: string; email: string }[] }[])
      .flatMap((s) => s.comptes)
      .find((c) => c.email === COMPTES.salarie)!.id;
  });

  // Le compte est rendu actif pour les parcours suivants, qui partagent la base.
  afterAll(async () => {
    await actif(true);
    await app.close();
  });

  it('la désactivation annule le lien en attente : il ne rallume pas le compte', async () => {
    const lien = await emettreLien();
    await actif(false).expect(200);
    // Annulé en base par la désactivation elle-même (pas seulement refusé à l'usage).
    const enAttente = await runAsSystem('test : liens en attente', () =>
      app.get(PrismaService).invitation.count({ where: { utilisateurId: compteId, usedAt: null } }),
    );
    expect(enAttente).toBe(0);
    const r = await groupe()
      .post('/api/auth/reinitialisation')
      .send({ token: lien, motDePasse: 'un-mot-de-passe-solide-2026' })
      .expect(400);
    expect(r.body.message).toBe('Lien invalide ou expiré');
    const etat = await runAsSystem('test : état du compte', () =>
      app.get(PrismaService).utilisateur.findUniqueOrThrow({ where: { id: compteId }, select: { actif: true } }),
    );
    expect(etat.actif).toBe(false);
  });

  it('un lien émis sur un compte déjà désactivé est refusé aussi', async () => {
    const lien = await emettreLien();
    await groupe()
      .post('/api/auth/reinitialisation')
      .send({ token: lien, motDePasse: 'un-mot-de-passe-solide-2026' })
      .expect(400);
  });

  it('après réactivation, le compte se connecte toujours avec son mot de passe', async () => {
    await actif(true).expect(200);
    await connecter(app, COMPTES.salarie);
  });

  it('sur un compte actif, un lien de nouveau mot de passe fonctionne toujours (transaction réelle)', async () => {
    const prisma = app.get(PrismaService);
    const { motDePasseHash: ancien } = await runAsSystem('test : mot de passe d’origine', () =>
      prisma.utilisateur.findUniqueOrThrow({ where: { id: compteId }, select: { motDePasseHash: true } }),
    );
    try {
      const lien = await emettreLien();
      await groupe()
        .post('/api/auth/reinitialisation')
        .send({ token: lien, motDePasse: 'un-mot-de-passe-solide-2026' })
        .expect(200);
      await connecter(app, COMPTES.salarie, 'un-mot-de-passe-solide-2026');
      // Le même lien ne resert pas.
      await groupe()
        .post('/api/auth/reinitialisation')
        .send({ token: lien, motDePasse: 'un-autre-mot-de-passe-2026' })
        .expect(400);
    } finally {
      // Mot de passe d'origine rendu pour les parcours suivants.
      await runAsSystem('test : mot de passe rendu', () =>
        prisma.utilisateur.update({ where: { id: compteId }, data: { motDePasseHash: ancien } }),
      );
    }
    await connecter(app, COMPTES.salarie);
  });
});
