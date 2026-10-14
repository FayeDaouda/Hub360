import { PrismaService } from '../prisma/prisma.service';
import { RechercheService } from './recherche.service';

function svc() {
  const prisma = {
    dossierCrm: { findMany: jest.fn().mockResolvedValue([{ id: 'L1', code: 'DIOP_DKR.26', archiveLe: null, client: { nom: 'Diop' } }]) },
    projet: { findMany: jest.fn().mockResolvedValue([{ id: 'P1', code: 'DIOP_DKR.26', programme: 'Villa', client: { nom: 'Diop' } }]) },
    devis: { findMany: jest.fn().mockResolvedValue([]) },
    facture: { findMany: jest.fn().mockResolvedValue([]) },
    dossierPersonnel: { findMany: jest.fn().mockResolvedValue([]) },
    collaborateur: { findFirst: jest.fn().mockResolvedValue({ id: 'C1' }) },
  };
  return { s: new RechercheService(prisma as unknown as PrismaService), prisma };
}

describe('RechercheService', () => {
  it('moins de 2 caractères : aucune requête', async () => {
    const { s, prisma } = svc();
    expect(await s.chercher({ userId: 'U1', societeId: 'S1', role: 'CIO', permissions: { crm: 'ecriture' } }, ' d ')).toEqual([]);
    expect(prisma.dossierCrm.findMany).not.toHaveBeenCalled();
  });

  it('chaque type seulement avec la lecture du module', async () => {
    const { s, prisma } = svc();
    const r = await s.chercher({ userId: 'U1', societeId: 'S1', role: 'Salarié', permissions: { projets: 'lecture', crm: 'aucun' } }, 'diop');
    expect(r.map((x) => x.type)).toEqual(['projet']);
    expect(prisma.dossierCrm.findMany).not.toHaveBeenCalled();
    expect(prisma.facture.findMany).not.toHaveBeenCalled();
    expect(prisma.dossierPersonnel.findMany).not.toHaveBeenCalled();
    // Salarié : périmètre Projets appliqué (ses projets seulement).
    const [perimetre] = prisma.projet.findMany.mock.calls[0][0].where.AND;
    expect(JSON.stringify(perimetre)).toContain('C1');
  });

  it('numéro en fin de saisie : recherche aussi par rang séquentiel', async () => {
    const { s, prisma } = svc();
    await s.chercher({ userId: 'U1', societeId: 'S1', role: 'CFO', permissions: { finances_devis: 'lecture', finances_factures: 'lecture' } }, 'DEV2026-0004');
    expect(prisma.devis.findMany.mock.calls[0][0].where.OR).toContainEqual({ numero: 4 });
    expect(prisma.facture.findMany.mock.calls[0][0].where.OR).toContainEqual({ numero: 4 });
  });
});
