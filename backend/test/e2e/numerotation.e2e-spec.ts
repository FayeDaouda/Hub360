import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { api, COMPTES, connecter, demarrer, SLUG } from './app';
import { urlBaseE2e } from './base';

// Numérotation légale des factures (lot 6 CFO) : attribuée à l'émission,
// chronologique, continue, sans trou ni doublon — y compris quand plusieurs
// émissions arrivent en même temps. Un brouillon n'a pas de numéro : le
// supprimer ne laisse pas de trou.
type Facture = { id: string; statut: string; reference: string | null };

describe('Numérotation des factures à l’émission', () => {
  // Le service retente 5 fois une émission qui perd la course au numéro : au
  // plus 5 émissions simultanées par société aboutissent toutes (limite
  // signalée, verrou de numérotation proposé).
  const SIMULTANEES = 4;
  let app: INestApplication;
  let prisma: PrismaClient;
  let cfo: ReturnType<typeof api>;
  let societeId: string;

  beforeAll(async () => {
    app = await demarrer();
    // Un seul serveur à l'écoute pour toutes les requêtes simultanées (sinon
    // supertest en ouvre un éphémère par requête : connexions coupées).
    await app.listen(0);
    prisma = new PrismaClient({ datasources: { db: { url: urlBaseE2e() } } });
    societeId = (await prisma.societe.findUniqueOrThrow({ where: { slug: SLUG } })).id;
    cfo = api(app, await connecter(app, COMPTES.cfo));
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const brouillon = async (designation: string): Promise<Facture> => {
    const [lead] = (await cfo.get('/factures/leads').expect(200)).body as { id: string }[];
    return (
      await cfo
        .post('/factures/directes', { dossierCrmId: lead.id, lignes: [{ designation, montantHt: 10_000 }] })
        .expect(201)
    ).body as Facture;
  };

  it('des émissions simultanées reçoivent des numéros consécutifs, uniques, chronologiques ; la séquence reste continue', async () => {
    const supprime = await brouillon('Brouillon supprimé');
    expect(supprime.reference).toBeNull();
    await cfo.delete(`/factures/${supprime.id}`).expect(200);

    const brouillons = await Promise.all(
      Array.from({ length: SIMULTANEES }, (_, i) => brouillon(`Émission simultanée ${i + 1}`)),
    );
    const emises: Facture[] = await Promise.all(
      brouillons.map(async (b) => (await cfo.post(`/factures/${b.id}/emission`).expect(201)).body as Facture),
    );
    expect(emises.every((f) => f.statut === 'emise' && f.reference)).toBe(true);

    const lignes = await prisma.facture.findMany({
      where: { id: { in: emises.map((f) => f.id) } },
      select: { numero: true, refSequence: true, emiseLe: true, ordreEmission: true },
      orderBy: { refSequence: 'asc' },
    });
    const sequences = lignes.map((l) => l.refSequence!);
    // Consécutifs et uniques : un bloc continu de SIMULTANEES numéros.
    expect(new Set(sequences).size).toBe(SIMULTANEES);
    expect(sequences[SIMULTANEES - 1] - sequences[0]).toBe(SIMULTANEES - 1);
    // Numéro interne : même garantie.
    const numeros = lignes.map((l) => l.numero!).sort((a, b) => a - b);
    expect(numeros[SIMULTANEES - 1] - numeros[0]).toBe(SIMULTANEES - 1);
    // Chronologiques : dans l'ordre des numéros, émission jamais antérieure,
    // et ordre réel des événements (séquence du journal) strictement croissant.
    for (let i = 1; i < lignes.length; i++) {
      expect(lignes[i].emiseLe!.getTime()).toBeGreaterThanOrEqual(lignes[i - 1].emiseLe!.getTime());
      expect(lignes[i].ordreEmission! > lignes[i - 1].ordreEmission!).toBe(true);
    }

    // Toute la séquence légale de la société, émissions précédentes comprises :
    // autant de numéros que d'écart entre le premier et le dernier (aucun trou),
    // et aucun numéro porté par deux factures.
    const series = await prisma.facture.groupBy({
      by: ['refPrefixe', 'refAnnee'],
      where: { societeId, refSequence: { not: null } },
      _count: { refSequence: true },
      _min: { refSequence: true },
      _max: { refSequence: true },
    });
    expect(series.length).toBeGreaterThan(0);
    for (const s of series) {
      expect(s._max.refSequence! - s._min.refSequence! + 1).toBe(s._count.refSequence);
    }
    const doublons = await prisma.facture.groupBy({
      by: ['refPrefixe', 'refAnnee', 'refSequence'],
      where: { societeId, refSequence: { not: null } },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    });
    expect(doublons).toEqual([]);
  });
});
