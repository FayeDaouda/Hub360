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
  const tx = {
    dossierCrm: { updateMany: jest.fn().mockResolvedValue({ count: o.count ?? 1 }) },
    dossierCrmTransition: { create: jest.fn(), updateMany: jest.fn() },
    projetCellule: { deleteMany: jest.fn(), createMany: jest.fn() },
    interventionHub: { create: jest.fn() },
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
    onboarderParContrat: jest.fn((_s: string, _d: string, _p: string, fn: (t: typeof tx) => Promise<void>) => fn(tx)),
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
  it('onboard sans signature : l’Onboard du contrat, transition renommée, intervention tracée', async () => {
    const { svc, tx, crm } = setup({ dossier: { code: 'GB_TBD.26', statut: 'offre_envoyee' } });
    await svc.onboardWithoutSignature('S1', 'D1', 'ADM', 'Projet test');
    expect(crm.onboarderParContrat).toHaveBeenCalledWith('S1', 'D1', 'ADM', expect.any(Function));
    expect(tx.dossierCrmTransition.updateMany).toHaveBeenCalledWith({
      where: { dossierId: 'D1', vers: 'onboard', commentaire: 'Contrat signé.' },
      data: { commentaire: 'Signature client sautée par l’Administrateur HUB : Projet test' },
    });
    expect(intervention(tx)).toEqual({
      societeId: 'S1',
      parId: 'ADM',
      type: 'onboard_sans_signature',
      cible: 'GB_TBD.26',
      detail: 'Onboard sans contrat signé',
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
});
