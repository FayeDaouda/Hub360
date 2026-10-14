import { Prisma } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TachesProjetService } from '../projets/gabarit/taches-projet.service';
import { AvenantsTsService } from './avenants-ts.service';
import { DevisService } from './devis.service';

const dec = (n: number) => new Prisma.Decimal(n);

function svc(o: { produit?: unknown; enCours?: unknown; verification?: Error } = {}) {
  const majTache = jest.fn();
  const prisma = {
    projet: { findFirst: jest.fn().mockResolvedValue({ code: 'GC-01', clientId: 'CL1', dossierCrm: { proprietaireId: 'P9' } }) },
    produitService: { findFirst: jest.fn().mockResolvedValue(o.produit === undefined ? { id: 'TSMIN' } : o.produit) },
    devis: { findFirst: jest.fn().mockResolvedValue(o.enCours ?? null) },
    tacheProjet: { update: majTache },
  } as unknown as PrismaService;
  const devis = {
    verifierLignesProjet: o.verification ? jest.fn().mockRejectedValue(o.verification) : jest.fn(),
    creer: jest.fn().mockResolvedValue({ id: 'DV-NEUF' }),
    patch: jest.fn().mockResolvedValue({ id: 'DV-EN-COURS' }),
  };
  const taches = { ajouterTs: jest.fn().mockResolvedValue({ id: 'T9', libelle: 'TS1 · Pièce intérieure · Bureau' }) };
  const notifications = { envoyer: jest.fn(), titulairesRole: jest.fn().mockResolvedValue(['CFO1']) };
  const s = new AvenantsTsService(
    prisma,
    devis as unknown as DevisService,
    taches as unknown as TachesProjetService,
    notifications as unknown as NotificationsService,
  );
  return { s, devis, taches, notifications, majTache };
}

const acteur = { userId: 'DPLG1', role: 'Dir. GC' };
const mineure = { carteId: 'C1', element: 'Bureau', reprise: 'mineure' as const };

describe('AvenantsTsService.ajouterTs', () => {
  it('sans avenant en préparation : crée le devis, relie la tâche, prévient propriétaire + CFO', async () => {
    const { s, devis, majTache, notifications } = svc();
    const r = await s.ajouterTs('S1', acteur, 'P1', mineure);
    expect(devis.creer).toHaveBeenCalledWith('S1', expect.objectContaining({
      clientId: 'CL1', projetId: 'P1', lignes: [expect.objectContaining({ produitServiceId: 'TSMIN', designation: 'TS1 · Pièce intérieure · Bureau', quantite: 1 })],
    }));
    expect(majTache).toHaveBeenCalledWith({ where: { id: 'T9' }, data: { devisTsId: 'DV-NEUF' } });
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'avenant_ts', destinataireIds: ['P9', 'CFO1'] }));
    expect(r.devisId).toBe('DV-NEUF');
  });

  it('avenant en brouillon : la ligne s’ajoute aux siennes', async () => {
    const existante = { produitServiceId: 'TSMIN', designation: 'TS0', quantite: dec(1), prixUnitaire: dec(100_000), tauxTva: dec(18), surfaceM2: null, planches: null };
    const { s, devis } = svc({ enCours: { id: 'DV-EN-COURS', lignes: [existante] } });
    await s.ajouterTs('S1', acteur, 'P1', { ...mineure, reprise: 'majeure', surfaceM2: 40, planches: 2 });
    expect(devis.creer).not.toHaveBeenCalled();
    const lignes = devis.patch.mock.calls[0][2].lignes;
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toEqual(expect.objectContaining({ surfaceM2: 40, planches: 2 }));
  });

  it('chiffrage refusé : aucune tâche créée', async () => {
    const { s, taches } = svc({ verification: new UnprocessableEntityException('catégorie CO inconnue') });
    await expect(s.ajouterTs('S1', acteur, 'P1', mineure)).rejects.toThrow('catégorie CO');
    expect(taches.ajouterTs).not.toHaveBeenCalled();
  });

  it('produit TS absent du catalogue : refus clair', async () => {
    await expect(svc({ produit: null }).s.ajouterTs('S1', acteur, 'P1', mineure)).rejects.toThrow('TS-MIN absent du catalogue');
  });
});
