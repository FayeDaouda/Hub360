import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from '../crm/crm.service';
import { ProjectOpeningService } from '../projects/project-opening.service';
import { InterventionsService } from './interventions.service';

// Déblocages de l'Administrateur HUB : chacun passe par la règle métier
// existante quand il y en a une, et laisse une intervention motivée au
// journal, dans la même transaction.

function setup(
  o: {
    dossier?: unknown;
    projet?: unknown;
    offres?: unknown[];
    cellules?: unknown[];
    plan?: unknown;
    saved?: boolean;
    count?: number;
  } = {},
) {
  // Ordre des suppressions, pour vérifier le respect des clés étrangères.
  const ordre: string[] = [];
  const supprime = (quoi: string) => jest.fn(async () => void ordre.push(quoi));
  const tx = {
    dossierCrm: {
      updateMany: jest.fn().mockResolvedValue({ count: o.count ?? 1 }),
      delete: supprime('dossier'),
    },
    dossierCrmTransition: { create: jest.fn(), updateMany: jest.fn() },
    projetCellule: { deleteMany: jest.fn(), createMany: jest.fn() },
    interventionHub: { create: jest.fn() },
    contrat: { deleteMany: supprime('contrat') },
    facture: {
      count: jest.fn(async ({ where }: { where: { emiseLe?: unknown } }) => (where.emiseLe ? 1 : 4)),
      deleteMany: jest.fn(
        async ({ where }: { where: { factureOrigineId?: unknown } }) =>
          void ordre.push(where.factureOrigineId ? 'avoirs' : 'factures'),
      ),
    },
    paiement: { count: jest.fn().mockResolvedValue(2) },
    devis: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([{ id: 'O1' }]),
      deleteMany: supprime('offres'),
    },
    carteProjet: { count: jest.fn().mockResolvedValue(24) },
    tacheProjet: { count: jest.fn().mockResolvedValue(76) },
    projet: { delete: supprime('projet') },
    ordre,
  };
  const prisma = {
    // Même ligne pour la garde et pour l'état rendu (state).
    dossierCrm: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          o.dossier ? { id: 'D1', client: { nom: 'C' }, offres: [], contrat: null, ...o.dossier } : null,
        ),
    },
    projet: {
      findFirst: jest
        .fn()
        .mockResolvedValue(o.projet ? { id: 'P1', categorie: 'conception', cellules: [], ...o.projet } : null),
    },
    cellule: { findMany: jest.fn().mockResolvedValue(o.cellules ?? []) },
    devis: { findMany: jest.fn().mockResolvedValue(o.offres ?? []) },
    interventionHub: { findMany: jest.fn().mockResolvedValue([]) },
    utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const crm = {
    onboarderOffreAcceptee: jest.fn(
      (_s: string, _d: string, _p: string, _c: string, fn: (t: typeof tx) => Promise<void>) => fn(tx),
    ),
  };
  const opening = {
    prepare: jest.fn().mockResolvedValue(o.plan ?? null),
    save: jest.fn().mockResolvedValue(o.saved ?? true),
  };
  const svc = new InterventionsService(
    prisma as unknown as PrismaService,
    crm as unknown as CrmService,
    opening as unknown as ProjectOpeningService,
  );
  return { svc, tx, prisma, crm, opening };
}

const intervention = (tx: { interventionHub: { create: jest.Mock } }) =>
  tx.interventionHub.create.mock.calls[0][0].data;

describe('InterventionsService', () => {
  it('offre acceptée en attente : l’Onboard de l’acceptation, motif au journal, intervention tracée', async () => {
    const { svc, tx, crm } = setup({ dossier: { code: 'GB_TBD.26', statut: 'offre_envoyee' } });
    await svc.onboardWithoutSignature('S1', 'D1', 'ADM', 'Projet test');
    expect(crm.onboarderOffreAcceptee).toHaveBeenCalledWith(
      'S1',
      'D1',
      'ADM',
      'Onboard débloqué par l’Administrateur HUB : Projet test',
      expect.any(Function),
    );
    expect(intervention(tx)).toEqual({
      societeId: 'S1',
      parId: 'ADM',
      type: 'onboard_sans_signature',
      cible: 'GB_TBD.26',
      detail: 'Onboard d’une offre acceptée en attente',
      motif: 'Projet test',
    });
  });

  it('réouverture : perdu → nouveau projet, transition et intervention', async () => {
    const { svc, tx } = setup({ dossier: { code: 'AM_STL.26', statut: 'perdu' } });
    await svc.reopenDossier('S1', 'D1', 'ADM', 'Client revenu');
    expect(tx.dossierCrm.updateMany).toHaveBeenCalledWith({
      where: { id: 'D1', statut: 'perdu' },
      data: { statut: 'nouveau_projet' },
    });
    expect(tx.dossierCrmTransition.create.mock.calls[0][0].data).toMatchObject({
      de: 'perdu',
      vers: 'nouveau_projet',
      parId: 'ADM',
    });
    expect(intervention(tx)).toMatchObject({ type: 'reouverture_dossier', cible: 'AM_STL.26' });
  });

  it('réouverture refusée : dossier non perdu, ou offre en attente de réponse', async () => {
    await expect(
      setup({ dossier: { code: 'X', statut: 'offre_envoyee' } }).svc.reopenDossier('S1', 'D1', 'ADM', 'm'),
    ).rejects.toThrow(ConflictException);
    const enAttente = setup({
      dossier: { code: 'X', statut: 'perdu' },
      offres: [{ statut: 'envoye', dateValidite: '2999-01-01' }],
    });
    await expect(enAttente.svc.reopenDossier('S1', 'D1', 'ADM', 'm')).rejects.toThrow(ConflictException);
    expect(enAttente.tx.interventionHub.create).not.toHaveBeenCalled();
  });

  it('ouverture du projet : plan du gabarit enregistré, intervention avec J1 et cartes', async () => {
    const plan = { day1: '2026-10-29', cards: [{}, {}] };
    const { svc, tx, opening } = setup({ projet: { code: 'GB_TBD.26', ouvertLe: null }, plan });
    await svc.openProject('S1', 'P1', 'ADM', 'Projet test');
    expect(opening.save).toHaveBeenCalledWith(tx, plan);
    expect(intervention(tx)).toMatchObject({ type: 'ouverture_projet', detail: 'J1 le 29/10/2026 · 2 cartes' });
  });

  it('ouverture refusée : déjà ouvert, ou pas de gabarit', async () => {
    await expect(
      setup({ projet: { code: 'X', ouvertLe: '2026-10-01' } }).svc.openProject('S1', 'P1', 'ADM', 'm'),
    ).rejects.toThrow(ConflictException);
    await expect(
      setup({ projet: { code: 'X', ouvertLe: null }, plan: null }).svc.openProject('S1', 'P1', 'ADM', 'm'),
    ).rejects.toThrow(ConflictException);
    await expect(setup().svc.openProject('S1', 'P1', 'ADM', 'm')).rejects.toThrow(NotFoundException);
  });

  it('cellules : l’ensemble est remplacé, intervention nommant les cellules', async () => {
    const { svc, tx } = setup({
      projet: { code: 'GB_TBD.26', ouvertLe: '2026-10-29' },
      cellules: [
        { id: 'C1', nom: 'Atelier A' },
        { id: 'C2', nom: 'Atelier B' },
      ],
    });
    await svc.setCells('S1', 'P1', ['C1', 'C2', 'C1'], 'ADM', 'Répartition');
    expect(tx.projetCellule.deleteMany).toHaveBeenCalledWith({ where: { projetId: 'P1' } });
    expect(tx.projetCellule.createMany).toHaveBeenCalledWith({
      data: [
        { projetId: 'P1', celluleId: 'C1' },
        { projetId: 'P1', celluleId: 'C2' },
      ],
    });
    expect(intervention(tx)).toMatchObject({ type: 'cellules_projet', detail: 'Cellules : Atelier A, Atelier B' });
  });

  it('cellules : une cellule d’une autre société (introuvable) → 404, rien d’écrit', async () => {
    const { svc, tx } = setup({ projet: { code: 'X', ouvertLe: null }, cellules: [{ id: 'C1', nom: 'A' }] });
    await expect(svc.setCells('S1', 'P1', ['C1', 'C9'], 'ADM', 'm')).rejects.toThrow(NotFoundException);
    expect(tx.projetCellule.deleteMany).not.toHaveBeenCalled();
  });

  it('suppression : contrat, avoirs, factures, offres, projet puis dossier ; décompte au journal', async () => {
    const { svc, tx } = setup({ dossier: { code: 'GB_TBD.26', statut: 'onboard' }, projet: { code: 'GB_TBD.26' } });
    await svc.deleteCode('S1', 'GB_TBD.26', 'ADM', 'Projet test');
    expect(tx.ordre).toEqual(['contrat', 'avoirs', 'factures', 'offres', 'projet', 'dossier']);
    expect(tx.projet.delete).toHaveBeenCalledWith({ where: { id: 'P1' } });
    expect(tx.dossierCrm.delete).toHaveBeenCalledWith({ where: { id: 'D1' } });
    expect(intervention(tx)).toEqual({
      societeId: 'S1',
      parId: 'ADM',
      type: 'suppression',
      cible: 'GB_TBD.26',
      detail:
        'Supprimés : dossier CRM, projet (24 cartes, 76 tâches), 1 offre(s), 4 facture(s) dont 1 émise(s), 2 paiement(s)',
      motif: 'Projet test',
    });
  });

  it('suppression d’un dossier sans projet : le projet n’est pas touché ; code inconnu → 404', async () => {
    const { svc, tx } = setup({ dossier: { code: 'AM_STL.26', statut: 'perdu' } });
    await svc.deleteCode('S1', 'AM_STL.26', 'ADM', 'Doublon');
    expect(tx.projet.delete).not.toHaveBeenCalled();
    expect(tx.ordre).toEqual(['contrat', 'avoirs', 'factures', 'offres', 'dossier']);
    await expect(setup().svc.deleteCode('S1', 'X', 'ADM', 'm')).rejects.toThrow(NotFoundException);
  });
});
