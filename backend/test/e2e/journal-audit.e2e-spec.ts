import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { api, COMPTES, connecter, demarrer, SLUG } from './app';
import { urlBaseE2e } from './base';

// Ordre réel des événements du journal d'audit (migration ordre_journal) : à
// horodatage égal, la séquence posée par la base au moment de l'événement.
describe('Journal d’audit · ordre des événements', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let societeId: string;
  const MEME_INSTANT = new Date('2026-10-20T10:00:00.000Z');

  beforeAll(async () => {
    app = await demarrer();
    prisma = new PrismaClient({ datasources: { db: { url: urlBaseE2e() } } });
    societeId = (await prisma.societe.findUniqueOrThrow({ where: { slug: SLUG } })).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('deux événements au même instant sont numérotés dans leur ordre d’insertion', async () => {
    // Insérées à l'inverse de l'ordre alphabétique de leur libellé : seul
    // l'ordre d'insertion peut donner l'ordre attendu plus bas.
    const premier = await prisma.journalCloture.create({
      data: { societeId, mois: '2026-02', action: 'cloture', createdAt: MEME_INSTANT },
    });
    const second = await prisma.journalCloture.create({
      data: { societeId, mois: '2026-01', action: 'cloture', createdAt: MEME_INSTANT },
    });
    expect(premier.ordreJournal).not.toBeNull();
    expect(second.ordreJournal! > premier.ordreJournal!).toBe(true);
  });

  it('une émission est numérotée au moment où elle a lieu, pas à la création de la facture', async () => {
    const brouillon = await prisma.facture.findFirstOrThrow({ where: { societeId, statut: 'brouillon' } });
    expect(brouillon.ordreEmission).toBeNull();
    const avant = (await prisma.journalCloture.create({ data: { societeId, mois: '2026-03', action: 'cloture' } }))
      .ordreJournal!;
    const emise = await prisma.facture.update({ where: { id: brouillon.id }, data: { emiseLe: MEME_INSTANT } });
    expect(emise.ordreEmission! > avant).toBe(true);
    // Une autre modification ne renumérote pas l'événement.
    const modifiee = await prisma.facture.update({
      where: { id: brouillon.id },
      data: { libelle: `${brouillon.libelle} ` },
    });
    expect(modifiee.ordreEmission).toBe(emise.ordreEmission);
    await prisma.facture.update({ where: { id: brouillon.id }, data: { emiseLe: null, libelle: brouillon.libelle } });
  });

  it('le journal servi par l’API suit cet ordre, le plus récent d’abord', async () => {
    const ceo = api(app, await connecter(app, COMPTES.ceo));
    const r = await ceo.get('/journal-audit?debut=2026-10-20&fin=2026-10-20').expect(200);
    const clotures = (r.body.lignes as { id: string; action: string; detail: string; le: string }[]).filter(
      (l) => l.action === 'Mois clôturé' && l.le === MEME_INSTANT.toISOString(),
    );
    expect(clotures.map((l) => l.detail)).toEqual(['janvier 2026', 'février 2026']);
    expect(Object.keys(r.body.lignes[0])).not.toContain('ordre');
  });
});
