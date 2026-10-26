import { Prisma } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReglagesService } from '../reglages/reglages.service';
import { TachesProjetService } from '../projets/gabarit/taches-projet.service';
import { AvenantsTsService } from './avenants-ts.service';
import { DevisService } from './devis.service';

const dec = (n: number) => new Prisma.Decimal(n);

function svc(
  o: {
    produit?: unknown;
    enCours?: unknown;
    verification?: Error;
    prix?: { quantite: number; prixUnitaire: number };
    demande?: unknown;
  } = {},
) {
  const majTache = jest.fn();
  const projet = { code: 'GC-01', clientId: 'CL1', dossierCrm: { proprietaireId: 'P9' } };
  const prisma = {
    projet: { findFirst: jest.fn().mockResolvedValue(projet), findFirstOrThrow: jest.fn().mockResolvedValue(projet) },
    // Contexte du jour : un CTO, aucune absence.
    utilisateurSocieteRole: {
      findMany: jest.fn(({ where }: { where: { role: { nom: string } } }) =>
        Promise.resolve(where.role.nom === 'CTO (transverse)' ? [{ utilisateurId: 'CTO1' }] : []),
      ),
    },
    demandeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
    collaborateur: { findMany: jest.fn().mockResolvedValue([]) },
    demandeTs: {
      create: jest.fn().mockResolvedValue({ id: 'DTS1' }),
      findFirst: jest.fn().mockResolvedValue(o.demande ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    produitService: { findFirst: jest.fn().mockResolvedValue(o.produit === undefined ? { id: 'TSMIN' } : o.produit) },
    devis: { findFirst: jest.fn().mockResolvedValue(o.enCours ?? null) },
    tacheProjet: { update: majTache },
  } as unknown as PrismaService;
  const devis = {
    verifierLignesProjet: o.verification
      ? jest.fn().mockRejectedValue(o.verification)
      : jest.fn().mockResolvedValue([o.prix ?? { quantite: 1, prixUnitaire: 100_000 }]),
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
    { regle: jest.fn().mockResolvedValue(500_000) } as unknown as ReglagesService,
  );
  return { s, devis, taches, notifications, majTache, prisma };
}

const acteur = { userId: 'DPLG1', role: 'Dir. GC' };
const mineure = { carteId: 'C1', element: 'Bureau', reprise: 'mineure' as const };

describe('AvenantsTsService.ajouterTs', () => {
  it('sans avenant en préparation : crée le devis, relie la tâche, prévient propriétaire + CFO', async () => {
    const { s, devis, majTache, notifications } = svc();
    const r = await s.ajouterTs('S1', acteur, 'P1', mineure);
    expect(devis.creer).toHaveBeenCalledWith(
      'S1',
      expect.objectContaining({
        clientId: 'CL1',
        projetId: 'P1',
        lignes: [
          expect.objectContaining({
            produitServiceId: 'TSMIN',
            designation: 'TS1 · Pièce intérieure · Bureau',
            quantite: 1,
          }),
        ],
      }),
    );
    expect(majTache).toHaveBeenCalledWith({ where: { id: 'T9' }, data: { devisTsId: 'DV-NEUF' } });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'avenant_ts', destinataireIds: ['P9', 'CFO1'] }),
    );
    expect('devisId' in r && r.devisId).toBe('DV-NEUF');
  });

  it('avenant en brouillon : la ligne s’ajoute aux siennes', async () => {
    const existante = {
      produitServiceId: 'TSMIN',
      designation: 'TS0',
      quantite: dec(1),
      prixUnitaire: dec(100_000),
      tauxTva: dec(18),
      surfaceM2: null,
      planches: null,
    };
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
    await expect(svc({ produit: null }).s.ajouterTs('S1', acteur, 'P1', mineure)).rejects.toThrow(
      'TS-MIN absent du catalogue',
    );
  });
});

// Seuil des Réglages (revue Dir. GC, 21/10/2026) : 500 000 FCFA HT par défaut.
describe('AvenantsTsService · TS au-delà du seuil', () => {
  const majeure = {
    carteId: 'C1',
    element: 'Nouvelle planche R+2',
    reprise: 'majeure' as const,
    surfaceM2: 120,
    planches: 1,
  };
  const grosPrix = { quantite: 120, prixUnitaire: 7_000 }; // 840 000 FCFA HT

  it('Dir. GC au-delà du seuil : rien n’est ajouté, demande au CTO', async () => {
    const { s, taches, notifications, prisma } = svc({ prix: grosPrix });
    const r = await s.ajouterTs('S1', acteur, 'P1', majeure);
    expect(r).toEqual({ enAttente: true, demandeId: 'DTS1', montantHt: 840_000, seuil: 500_000 });
    expect(taches.ajouterTs).not.toHaveBeenCalled();
    expect(prisma.demandeTs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ montantHt: 840_000, demandeParId: 'DPLG1', surfaceM2: 120, planches: 1 }),
    });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ts_a_valider', destinataireIds: ['CTO1'] }),
    );
  });

  it('le CTO l’ajoute directement, même au-delà du seuil', async () => {
    const { s, taches } = svc({ prix: grosPrix });
    await s.ajouterTs('S1', { userId: 'CTO1', role: 'CTO (transverse)' }, 'P1', majeure);
    expect(taches.ajouterTs).toHaveBeenCalled();
  });

  it('décision : seul le CTO ; accepté → ajouté, demandeur prévenu ; refus motivé', async () => {
    const demande = {
      id: 'DTS1',
      projetId: 'P1',
      carteId: 'C1',
      element: 'Nouvelle planche R+2',
      reprise: 'majeure',
      surfaceM2: 120,
      planches: 1,
      demandeParId: 'DPLG1',
      projet: { code: 'GC-01' },
    };
    await expect(svc({ demande }).s.deciderDemande('S1', acteur, 'P1', 'DTS1', true)).rejects.toThrow(
      'validé par le CTO',
    );
    const cto = { userId: 'CTO1', role: 'CTO (transverse)' };
    const ok = svc({ demande, prix: grosPrix });
    expect(await ok.s.deciderDemande('S1', cto, 'P1', 'DTS1', true)).toEqual({ statut: 'acceptee', tacheId: 'T9' });
    expect(ok.taches.ajouterTs).toHaveBeenCalledWith('S1', cto, 'P1', 'C1', 'Nouvelle planche R+2');
    expect(ok.notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ts_decide', destinataireIds: ['DPLG1'] }),
    );
    await expect(svc({ demande }).s.deciderDemande('S1', cto, 'P1', 'DTS1', false)).rejects.toThrow('motif');
  });
});
