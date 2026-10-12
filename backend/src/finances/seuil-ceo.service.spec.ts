import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { ROLE_CEO, SeuilCeoService } from './seuil-ceo.service';

const d = (n: number) => new Prisma.Decimal(n);
// Une ligne d'offre : quantité 1, prix HT, TVA 18 %.
const ligne = (ht: number) => ({ quantite: d(1), prixUnitaire: d(ht), tauxTva: d(18) });
const SEUIL = 50_000_000;

function svc(o: { devis?: object[]; projets?: object[]; facture?: object | null; devisSeul?: object | null } = {}) {
  const prisma = {
    devis: {
      findMany: jest.fn().mockResolvedValue(o.devis ?? []),
      findFirst: jest.fn().mockResolvedValue(o.devisSeul ?? null),
    },
    projet: { findMany: jest.fn().mockResolvedValue(o.projets ?? []) },
    facture: { findFirst: jest.fn().mockResolvedValue(o.facture ?? null) },
  } as unknown as PrismaService;
  const reglages = { regle: jest.fn().mockResolvedValue(SEUIL) } as unknown as ReglagesService;
  return new SeuilCeoService(prisma, reglages);
}

const facture = (id: string, champs: object = {}) => ({
  id,
  montantHt: d(10_000_000),
  tauxTva: d(18),
  devisEcheancierId: null,
  devisOrigineId: null,
  dossierCrmId: null,
  projetId: null,
  ...champs,
});

describe('SeuilCeoService.montantsAffaire', () => {
  it("tranche d'une offre → TTC de l'offre ; projet → offre acceptée de son dossier ; sans offre → la facture", async () => {
    const s = svc({
      devis: [
        { id: 'OFFRE', dossierCrmId: 'DOS1', statut: 'accepte', lignes: [ligne(50_000_000)] },
        { id: 'OFFRE2', dossierCrmId: 'DOS2', statut: 'accepte', lignes: [ligne(10_000_000)] },
      ],
      projets: [{ id: 'P2', dossierCrmId: 'DOS2' }],
    });
    const m = await s.montantsAffaire([
      facture('F1', { devisEcheancierId: 'OFFRE' }),
      facture('F2', { projetId: 'P2' }),
      facture('F3'),
    ] as never);
    expect(m.get('F1')).toBe(59_000_000);
    expect(m.get('F2')).toBe(11_800_000);
    expect(m.get('F3')).toBe(11_800_000);
  });
});

describe('SeuilCeoService · contrôles', () => {
  it('un autre rôle que le CEO passe sans lecture', async () => {
    const s = svc();
    await expect(s.verifierFacture('CFO', 'S', 'F')).resolves.toBeUndefined();
  });
  it('CEO : affaire au-delà du seuil → accepté ; en deçà (ou pile) → refusé', async () => {
    const au = svc({ facture: facture('F', { devisEcheancierId: 'O' }), devis: [{ id: 'O', dossierCrmId: null, statut: 'accepte', lignes: [ligne(50_000_000)] }] });
    await expect(au.verifierFacture(ROLE_CEO, 'S', 'F')).resolves.toBeUndefined();
    const deca = svc({ facture: facture('F') });
    await expect(deca.verifierFacture(ROLE_CEO, 'S', 'F')).rejects.toThrow(ForbiddenException);
    const pile = svc({ devisSeul: { lignes: [{ quantite: d(1), prixUnitaire: d(SEUIL), tauxTva: d(0) }] } });
    await expect(pile.verifierDevis(ROLE_CEO, 'S', 'D')).rejects.toThrow('la validation revient au CFO');
  });
});
