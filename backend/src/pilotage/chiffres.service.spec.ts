import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { IntegrationService } from '../rh/integration.service';
import { ChiffresPilotageService } from './chiffres.service';

const d = (n: number) => new Prisma.Decimal(n);
const JOUR = '2026-10-12';
const FEUILLES = { total: 3, controlees: 1 };
const HEURE = 3600 * 1000;
const FICHE_COMPLETE = {
  code: 'X', categorie: 'conception', localiteId: 'L', type: 'villa', surfaceTerrain: 300, nbPlanches: 2,
  clientId: 'C', standing: 's', gamme: 'g', programme: 'Villa',
};

function svc(o: { dossiers?: object[] } = {}) {
  const prisma = {
    facture: {
      findMany: jest.fn().mockImplementation(({ where }) =>
        where.statut === 'emise'
          ? Promise.resolve([{ montantHt: d(1_000_000), tauxTva: d(18), paiements: [{ montant: d(180_000) }] }])
          : Promise.resolve([
              { montantHt: d(1_000_000), tauxTva: d(18), estAvoir: false },
              { montantHt: d(-500_000), tauxTva: d(18), estAvoir: true },
            ]),
      ),
    },
    paiement: { findMany: jest.fn().mockResolvedValue([{ montant: d(300_000) }]) },
    projet: { count: jest.fn().mockResolvedValue(5) },
    dossierCrm: { findMany: jest.fn().mockResolvedValue(o.dossiers ?? []) },
    demandeAbsence: { count: jest.fn().mockResolvedValue(2) },
    demandeRemboursement: { count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;
  const integration = { liste: jest.fn().mockResolvedValue([{ aTraiter: 1 }]) } as unknown as IntegrationService;
  return new ChiffresPilotageService(prisma, integration);
}

describe('ChiffresPilotageService', () => {
  it('rangée selon la matrice : Finances + Projets, sinon CRM, sinon RH', async () => {
    const s = svc();
    const jeu = async (permissions: Record<string, 'lecture'>) => (await s.tuiles({ societeId: 'S', role: 'X', permissions }, JOUR, FEUILLES))?.jeu ?? null;
    expect(await jeu({ finances_factures: 'lecture', projets: 'lecture', crm: 'lecture' })).toBe('finances');
    expect(await jeu({ crm: 'lecture', pilotage: 'lecture' })).toBe('crm');
    expect(await jeu({ rh: 'lecture', pilotage: 'lecture' })).toBe('rh');
    expect(await jeu({ pilotage: 'lecture' })).toBeNull();
  });

  it('finances : facturé net des avoirs, encaissé du mois, reste en retard en rouge', async () => {
    const r = await svc().tuiles({ societeId: 'S', role: 'CEO (transverse)', permissions: { finances_factures: 'validation', projets: 'lecture' } }, JOUR, FEUILLES);
    expect(r!.tuiles).toEqual([
      expect.objectContaining({ cle: 'facture_mois', valeur: 590_000, etat: 'marque' }),
      expect.objectContaining({ cle: 'encaisse_mois', valeur: 300_000, etat: 'marque' }),
      expect.objectContaining({ cle: 'reste_retard', valeur: 1_000_000, etat: 'risque' }),
      expect.objectContaining({ cle: 'projets_ouverts', valeur: 5, etat: 'marque' }),
    ]);
  });

  it('CRM : fiche incomplète au-delà de 72 h → rouge ; offre chez la DAF depuis moins de 48 h → ambre', async () => {
    const maintenant = Date.now();
    const r = await svc({
      dossiers: [
        { ...FICHE_COMPLETE, gamme: null, statut: 'nouveau_projet', createdAt: new Date(maintenant - 80 * HEURE), offres: [], transitions: [] },
        { ...FICHE_COMPLETE, statut: 'en_validation', createdAt: new Date(maintenant - 100 * HEURE), offres: [], transitions: [{ creeLe: new Date(maintenant - 10 * HEURE) }] },
      ],
    }).tuiles({ societeId: 'S', role: 'COO', permissions: { crm: 'ecriture' } }, JOUR, FEUILLES);
    expect(r!.tuiles.find((t) => t.cle === 'fiches')).toMatchObject({ valeur: 1, etat: 'risque' });
    expect(r!.tuiles.find((t) => t.cle === 'cfo')).toMatchObject({ valeur: 1, etat: 'attention' });
    expect(r!.tuiles.find((t) => t.cle === 'pipeline')).toMatchObject({ valeur: 2, etat: 'marque' });
  });

  it('RH : à traiter en ambre, feuilles non contrôlées et points échus en rouge, rien → vert', async () => {
    const r = await svc().tuiles({ societeId: 'S', role: 'RH', permissions: { rh: 'ecriture' } }, JOUR, FEUILLES);
    expect(r!.tuiles.map((t) => [t.cle, t.valeur, t.etat])).toEqual([
      ['absences', 2, 'attention'],
      ['remboursements', 0, 'succes'],
      ['feuilles', 2, 'risque'],
      ['integration', 1, 'risque'],
    ]);
  });
});
