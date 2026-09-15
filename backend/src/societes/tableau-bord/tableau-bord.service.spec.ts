import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TableauBordService } from './tableau-bord.service';

const NOW = new Date('2026-09-10T14:30:00Z');

// Prisma bouché : on ne teste que l'assemblage, pas l'ORM.
function fakePrisma(projets: unknown[], factures: unknown[]): PrismaService {
  return {
    projet: { findMany: jest.fn().mockResolvedValue(projets) },
    facture: { findMany: jest.fn().mockResolvedValue(factures) },
  } as unknown as PrismaService;
}

const d = (v: number) => new Prisma.Decimal(v);

describe('TableauBordService — société vide', () => {
  it('ne renvoie que des zéros, aucune liste cassée, aucun NaN', async () => {
    const svc = new TableauBordService(fakePrisma([], []));
    const tb = await svc.pour('soc-1', 'mois', NOW);

    expect(tb.kpis.map((k) => k.valeur)).toEqual([0, 0, 0, 0]);
    tb.kpis.forEach((k) => expect(Number.isNaN(k.valeur)).toBe(false));
    expect(tb.kpis.find((k) => k.cle === 'projets-actifs')?.detail).toBeUndefined();

    expect(tb.avancementMoyen.pourcentage).toBe(0);
    expect(tb.jalons).toEqual([]);
    expect(tb.projets).toEqual([]);

    // histogramme : 6 barres (mois), toutes à 0, la dernière active
    expect(tb.projetsSignesParPeriode.points).toHaveLength(6);
    expect(tb.projetsSignesParPeriode.points.every((p) => p.valeur === 0)).toBe(true);
    expect(tb.projetsSignesParPeriode.points[5].actif).toBe(true);
    expect(tb.libellePeriode).toBe('1 – 30 septembre 2026');
  });
});

describe('TableauBordService — société peuplée', () => {
  const p1 = {
    id: 'p1',
    programme: 'Villa A',
    categorie: 'conception',
    nature: 'mandat_client',
    phase: 'permis',
    statut: 'en_cours',
    createdAt: new Date('2026-09-05T09:00:00Z'),
    client: { nom: 'Client A' },
    avantProjet: {
      valideLe: null,
      dateFin: '2026-09-15',
      besoinSurface: null,
      lignesChecklist: [{ fait: true }, { fait: false }],
    },
    permis: {
      dateDepot: new Date('2026-07-01T00:00:00Z'),
      dateObtention: null,
      dateRefus: null,
    },
    etudes: null,
    execution: null,
  };
  const p2 = {
    id: 'p2',
    programme: 'Immeuble B',
    categorie: 'amenagement',
    nature: 'promotion_interne',
    phase: 'livre',
    statut: 'livre',
    createdAt: new Date('2026-07-10T09:00:00Z'),
    client: { nom: 'Client B' },
    avantProjet: {
      valideLe: new Date('2026-06-01T00:00:00Z'),
      dateFin: '2026-05-30',
      besoinSurface: 800,
      lignesChecklist: [],
    },
    permis: null,
    etudes: null,
    execution: null,
  };
  const p3 = {
    id: 'p3',
    programme: 'Villa C',
    categorie: 'amenagement',
    nature: 'mandat_client',
    phase: 'avant_projet',
    statut: 'a_assigner',
    createdAt: new Date('2026-09-09T09:00:00Z'),
    client: { nom: 'Client C' },
    avantProjet: {
      valideLe: null,
      dateFin: null,
      besoinSurface: null,
      lignesChecklist: [],
    },
    permis: null,
    etudes: null,
    execution: null,
  };
  const facture = {
    montantHt: d(1_000_000),
    tauxTva: d(18),
    paiements: [{ montant: d(400_000) }],
  };

  const build = () =>
    new TableauBordService(fakePrisma([p1, p2, p3], [facture])).pour('soc-1', 'mois', NOW);

  it('KPI : compteurs, surface cumulée, reste à encaisser', async () => {
    const tb = await build();
    const parCle = Object.fromEntries(tb.kpis.map((k) => [k.cle, k]));

    expect(parCle['projets-actifs']).toMatchObject({
      valeur: 2,
      detail: '1 conception · 1 aménagement',
    });
    expect(parCle['projets-livres']).toMatchObject({
      valeur: 1,
      detail: 'sur 3 projets au total',
    });
    expect(parCle['surface-concue']).toMatchObject({
      valeur: 800,
      detail: 'sur 1 projet livré',
    });
    // TTC = 1 000 000 + 18 % = 1 180 000 ; payé 400 000 ; reste 780 000
    expect(parCle['reste-a-encaisser']).toMatchObject({
      valeur: 780_000,
      detail: 'à encaisser à ce jour',
    });
  });

  it('avancement moyen : sur les seuls actifs qui ont une checklist', async () => {
    const tb = await build();
    // p1 → 50 % (1/2) ; p3 exclu (aucune ligne) ; p2 exclu (livré)
    expect(tb.avancementMoyen.pourcentage).toBe(50);
  });

  it('histogramme : projets ventilés par mois de création', async () => {
    const tb = await build();
    const points = tb.projetsSignesParPeriode.points;
    expect(points.map((p) => p.valeur)).toEqual([0, 0, 0, 1, 0, 2]); // Juil: p2, Sept: p1+p3
    expect(points[5].actif).toBe(true);
  });

  it('jalons : avant-projet + permis, dates futures, triés, financier exclu', async () => {
    const tb = await build();
    expect(tb.jalons).toEqual([
      {
        id: 'ap:p1',
        date: '2026-09-15',
        projet: 'Villa A',
        type: 'Échéance avant-projet',
        statut: 'a_faire',
      },
      {
        id: 'permis:p1',
        date: '2026-09-29',
        projet: 'Villa A',
        type: "Fin d'instruction du permis",
        statut: 'a_faire',
      },
    ]);
  });

  it('projets : contrat aligné Prisma (categorie + promotionInterne + statut réel)', async () => {
    const tb = await build();
    expect(tb.projets).toEqual([
      {
        id: 'p1',
        nom: 'Villa A',
        categorie: 'conception',
        promotionInterne: false,
        client: 'Client A',
        avancement: 50,
        statut: 'en_cours',
      },
      {
        id: 'p3',
        nom: 'Villa C',
        categorie: 'amenagement',
        promotionInterne: false,
        client: 'Client C',
        avancement: 0,
        statut: 'a_assigner',
      },
    ]);
  });
});
