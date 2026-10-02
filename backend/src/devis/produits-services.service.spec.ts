import { ProduitsServicesService } from './produits-services.service';

// Grille verrouillée : un nouveau tarif suit les brouillons, pas les offres
// soumises au CFO, et jamais un prix modifiable à la saisie.
describe('ProduitsServicesService.patch', () => {
  const produit = (prixModifiable: boolean) => ({
    id: 'p1',
    societeId: 's1',
    code: 'CO1',
    famille: 'CO',
    unite: 'm2',
    modeCalcul: 'surface_planches',
    prixModifiable,
    coAssocie: null,
    designation: 'CO1 — Conception',
    prixUnitaire: { toNumber: () => 5500 },
    tauxTva: { toNumber: () => 18 },
    description: '',
  });

  function service(prixModifiable: boolean) {
    const tx = {
      produitService: { update: jest.fn().mockResolvedValue(produit(prixModifiable)) },
      ligneDevis: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      produitService: { findFirst: jest.fn().mockResolvedValue(produit(prixModifiable)) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    return { svc: new ProduitsServicesService(prisma as never), tx };
  }

  it('prix verrouillé : met à jour les lignes des brouillons non soumis', async () => {
    const { svc, tx } = service(false);
    await svc.patch('s1', 'p1', { prixUnitaire: 5500 });
    expect(tx.ligneDevis.updateMany).toHaveBeenCalledWith({
      where: {
        produitServiceId: 'p1',
        devis: { statut: 'brouillon', OR: [{ dossierCrmId: null }, { dossierCrm: { statut: { not: 'en_validation' } } }] },
      },
      data: { prixUnitaire: 5500, tauxTva: undefined },
    });
  });

  it('prix modifiable à la saisie : les lignes ne sont pas touchées', async () => {
    const { svc, tx } = service(true);
    await svc.patch('s1', 'p1', { prixUnitaire: 5500 });
    expect(tx.ligneDevis.updateMany).not.toHaveBeenCalled();
  });

  it('libellé seul : les lignes ne sont pas touchées', async () => {
    const { svc, tx } = service(false);
    await svc.patch('s1', 'p1', { designation: 'CO1 — Conception simple' });
    expect(tx.ligneDevis.updateMany).not.toHaveBeenCalled();
  });
});
