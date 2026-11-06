import { Prisma } from '@prisma/client';
import type { SeuilCeoService } from '../finances/seuil-ceo.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ProjectAlertsService } from '../projects/project-alerts.service';
import type { DemandesService } from '../rh/demandes.service';
import { AttentionService } from './attention.service';

const d = (n: number) => new Prisma.Decimal(n);
const TRANCHE = { projetId: 'P1', code: 'PRJ.26', client: 'Client', tranche: 'F2' as const, factureId: 'F2' };

function svc(affaire: number) {
  const prisma = {
    facture: {
      findMany: jest.fn().mockImplementation(({ where }) =>
        where.statut === 'emise'
          ? Promise.resolve([])
          : Promise.resolve([
              {
                id: 'F2',
                montantHt: d(1_000_000),
                tauxTva: d(18),
                devisEcheancierId: null,
                devisOrigineId: null,
                dossierCrmId: null,
                projetId: 'P1',
              },
            ]),
      ),
    },
  } as unknown as PrismaService;
  const projets = {
    alerts: jest.fn().mockResolvedValue({ retards: [], tranches: [TRANCHE], ts: [] }),
  } as unknown as ProjectAlertsService;
  const seuil = {
    seuil: jest.fn().mockResolvedValue(50_000_000),
    montantsAffaire: jest.fn().mockResolvedValue(new Map([['F2', affaire]])),
  } as unknown as SeuilCeoService;
  const demandes = { aValider: jest.fn().mockResolvedValue([]) } as unknown as DemandesService;
  return new AttentionService(prisma, projets, seuil, demandes);
}

const CEO = {
  userId: 'U',
  societeId: 'S',
  role: 'CEO (transverse)',
  permissions: { projets: 'lecture', finances_factures: 'validation', finances_devis: 'validation' } as const,
};

describe('AttentionService', () => {
  it('rubriques hors des droits de l’acteur → null', async () => {
    const r = await svc(0).attention({
      userId: 'U',
      societeId: 'S',
      role: 'COO',
      permissions: { 'crm.dossiers': 'LE', 'crm.soumission': 'E' },
    });
    expect(r).toMatchObject({ retards: null, factures: null, ts: null, absences: [] });
  });
  it('tranche prête : « par vous » pour le CEO au-delà du seuil seulement', async () => {
    expect((await svc(60_000_000).attention(CEO)).factures![0]).toMatchObject({
      etat: 'a_emettre',
      tranche: 'F2',
      montantTtc: 1_180_000,
      parVous: true,
    });
    expect((await svc(40_000_000).attention(CEO)).factures![0]).toMatchObject({ parVous: false });
  });
});
