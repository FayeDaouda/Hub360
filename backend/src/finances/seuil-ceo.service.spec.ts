import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { SeuilCeoService } from './seuil-ceo.service';
import { ROLE_CEO } from '@hub/domain';

const d = (n: number) => new Prisma.Decimal(n);
// Une ligne d'offre : quantité 1, prix HT, TVA 18 %.
const ligne = (ht: number) => ({ quantite: d(1), prixUnitaire: d(ht), tauxTva: d(18) });
const SEUIL = 50_000_000;

function svc(
  o: {
    devis?: object[];
    projets?: object[];
    facture?: object | null;
    devisSeul?: object | null;
    delegataire?: string;
  } = {},
) {
  const prisma = {
    devis: {
      findMany: jest.fn().mockResolvedValue(o.devis ?? []),
      findFirst: jest.fn().mockResolvedValue(o.devisSeul ?? null),
    },
    projet: { findMany: jest.fn().mockResolvedValue(o.projets ?? []) },
    facture: { findFirst: jest.fn().mockResolvedValue(o.facture ?? null) },
    delegationCeo: { findFirst: jest.fn().mockResolvedValue(o.delegataire ? { delegataireId: o.delegataire } : null) },
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

const CEO = { userId: 'CEO1', role: ROLE_CEO, permissions: { 'finances.contresignature': 'V' } };
const CFO = { userId: 'CFO1', role: 'CFO' };

describe('SeuilCeoService · contrôles', () => {
  it('un autre rôle que le CEO passe sans lecture', async () => {
    const s = svc();
    await expect(s.verifierFacture(CFO, 'S', 'F')).resolves.toBeUndefined();
  });
  it('CEO : affaire au-delà du seuil → accepté ; en deçà (ou pile) → refusé', async () => {
    const au = svc({
      facture: facture('F', { devisEcheancierId: 'O' }),
      devis: [{ id: 'O', dossierCrmId: null, statut: 'accepte', lignes: [ligne(50_000_000)] }],
    });
    await expect(au.verifierFacture(CEO, 'S', 'F')).resolves.toBeUndefined();
    const deca = svc({ facture: facture('F') });
    await expect(deca.verifierFacture(CEO, 'S', 'F')).rejects.toThrow(ForbiddenException);
    const pile = svc({ devisSeul: { lignes: [{ quantite: d(1), prixUnitaire: d(SEUIL), tauxTva: d(0) }] } });
    await expect(pile.verifierDevis(CEO, 'S', 'D')).rejects.toThrow('la validation revient au CFO');
  });
});

// Revue CEO (22/10/2026) : contresignature exclusive au-delà du seuil (envoi,
// émission), pas pour les encaissements ni les avoirs.
describe('SeuilCeoService · contresignature exclusive', () => {
  const auDela = {
    facture: facture('F', { devisEcheancierId: 'O' }),
    devis: [{ id: 'O', dossierCrmId: null, statut: 'accepte', lignes: [ligne(50_000_000)] }],
  };
  it('au-delà : le CFO refusé, sauf délégataire en fonction ; le compte de secours passe', async () => {
    await expect(svc(auDela).verifierFacture(CFO, 'S', 'F', true)).rejects.toThrow('revient au CEO');
    await expect(svc({ ...auDela, delegataire: 'CFO1' }).verifierFacture(CFO, 'S', 'F', true)).resolves.toBeUndefined();
    await expect(
      svc(auDela).verifierFacture({ userId: 'A', role: 'societe_admin' }, 'S', 'F', true),
    ).resolves.toBeUndefined();
  });
  it('en deçà, ou acte non exclusif (encaissement) : le CFO passe', async () => {
    await expect(svc({ facture: facture('F') }).verifierFacture(CFO, 'S', 'F', true)).resolves.toBeUndefined();
    await expect(svc(auDela).verifierFacture(CFO, 'S', 'F')).resolves.toBeUndefined();
  });
  it('offre d’un dossier au-delà du seuil : exclusive', async () => {
    await expect(
      svc({ devisSeul: { lignes: [ligne(60_000_000)] } }).verifierOffreDossier(CFO, 'S', 'DOS'),
    ).rejects.toThrow('revient au CEO');
    await expect(
      svc({ devisSeul: { lignes: [ligne(60_000_000)] } }).verifierOffreDossier(CEO, 'S', 'DOS'),
    ).resolves.toBeUndefined();
  });
});

// Remise de l'offre (09/11/2026) : le TTC comparé au seuil est le TTC REMISÉ —
// une remise peut faire repasser une affaire sous le seuil (validation CFO).
describe('SeuilCeoService · remise de l’offre', () => {
  // 50 000 000 HT brut → TTC brut 59 000 000 (au-delà du seuil de 50 M) ;
  // remise 20 % → 40 000 000 HT → 47 200 000 TTC (en deçà).
  const offreRemisee = { remisePct: 20, lignes: [ligne(50_000_000)] };

  it('montant de l’affaire d’une facture : TTC de l’offre remisée (tranche et dossier)', async () => {
    const s = svc({
      devis: [
        { id: 'OFFRE', dossierCrmId: null, statut: 'accepte', remisePct: 10, lignes: [ligne(50_000_000)] },
        { id: 'OFFRE2', dossierCrmId: 'DOS2', statut: 'accepte', remisePct: 25, lignes: [ligne(10_000_000)] },
      ],
      projets: [{ id: 'P2', dossierCrmId: 'DOS2' }],
    });
    const m = await s.montantsAffaire([
      facture('F1', { devisEcheancierId: 'OFFRE' }),
      facture('F2', { projetId: 'P2' }),
    ] as never);
    // 45 000 000 × 1,18 ; 7 500 000 × 1,18.
    expect(m.get('F1')).toBe(53_100_000);
    expect(m.get('F2')).toBe(8_850_000);
  });

  it('offre de dossier remisée sous le seuil : la validation n’est plus exclusive au CEO, le CFO passe', async () => {
    await expect(svc({ devisSeul: offreRemisee }).verifierOffreDossier(CFO, 'S', 'DOS')).resolves.toBeUndefined();
    // Sans remise, la même offre revient au CEO.
    await expect(
      svc({ devisSeul: { remisePct: null, lignes: [ligne(50_000_000)] } }).verifierOffreDossier(CFO, 'S', 'DOS'),
    ).rejects.toThrow('revient au CEO');
  });

  it('offreAuDelaDuSeuil : renvoie le TTC remisé, ou null si la remise ramène sous le seuil', async () => {
    const auDela = svc({ devisSeul: { remisePct: 5, lignes: [ligne(50_000_000)] } });
    await expect(auDela.offreAuDelaDuSeuil('S', 'DOS')).resolves.toBe(56_050_000);
    await expect(svc({ devisSeul: offreRemisee }).offreAuDelaDuSeuil('S', 'DOS')).resolves.toBeNull();
  });

  it('devis remisé sous le seuil : le CEO est renvoyé vers le CFO (montant remisé cité)', async () => {
    await expect(svc({ devisSeul: offreRemisee }).verifierDevis(CEO, 'S', 'D')).rejects.toThrow(
      /47[\s  ]200[\s  ]000.*la validation revient au CFO/,
    );
  });
});
