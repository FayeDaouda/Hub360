import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { DemandesService } from './demandes.service';

const DEMANDE = {
  id: 'D1', dossierId: 'DOS1', type: 'conge_paye', dateDebut: '2026-10-05', dateFin: '2026-10-09', jours: 5,
  statut: 'attente_n1', n1CollaborateurId: 'CHEF', n1Role: null, justificatifCle: null,
};
const BLOC = { avantProjetId: 'P1', groupe: 'plans', echeance: '2026-10-06', avantProjet: { projet: { code: 'PRJ.26' } } };

function svc(o: { demande?: object; moiCollab?: string; blocs?: object[]; moi?: object | null } = {}) {
  const update = jest.fn().mockImplementation(({ data }) => ({ ...DEMANDE, ...o.demande, ...data }));
  const majAvp = jest.fn().mockReturnValue('majAvp');
  const prisma = {
    demandeAbsence: {
      findUnique: jest.fn().mockResolvedValue({ ...DEMANDE, ...o.demande }),
      update,
      create: jest.fn().mockImplementation(({ data }) => ({ ...DEMANDE, ...data })),
    },
    collaborateur: {
      findFirst: jest.fn().mockResolvedValue(o.moiCollab === undefined ? { id: 'CHEF' } : o.moiCollab ? { id: o.moiCollab } : null),
      findMany: jest.fn().mockResolvedValue([{ id: 'X1' }, { id: 'X2' }, { id: 'COLLAB' }]),
    },
    dossierPersonnel: {
      findUnique: jest.fn().mockResolvedValue({ societeId: 'S', collaborateur: { id: 'COLLAB', celluleId: 'CEL', societeId: 'S' } }),
      findFirst: jest.fn().mockResolvedValue(o.moi === undefined ? { id: 'DOS1', collaborateur: null } : o.moi),
    },
    blocChecklistAvp: { findMany: jest.fn().mockResolvedValue(o.blocs ?? [BLOC]), update: majAvp },
    blocPermis: { findMany: jest.fn().mockResolvedValue([]) },
    blocExecution: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.resolve(ops.map(() => ({ ...DEMANDE, statut: 'accord_n1' })))),
  } as unknown as PrismaService;
  return { s: new DemandesService(prisma, { joursFeries: jest.fn().mockImplementation((ids: string[]) => Promise.resolve(new Map(ids.map((i) => [i, new Set<string>()])))) } as unknown as ReglagesService), update, majAvp };
}
const CHEF = { userId: 'U', societeId: 'S', role: 'collaborateur' };
const CLE = 'avant-projet:P1:plans';

describe('DemandesService.decider (N+1)', () => {
  it('refuse si l’appelant n’est pas le N+1', async () => {
    await expect(svc({ moiCollab: 'AUTRE' }).s.decider(CHEF, 'D1', { decision: 'refuser', motif: 'periode_critique' })).rejects.toThrow(ForbiddenException);
  });
  it('refus : motif obligatoire, commentaire obligatoire si « autre »', async () => {
    const { s } = svc();
    await expect(s.decider(CHEF, 'D1', { decision: 'refuser' })).rejects.toThrow(BadRequestException);
    await expect(s.decider(CHEF, 'D1', { decision: 'refuser', motif: 'autre' })).rejects.toThrow('Autre');
  });
  it('valider : un livrable non confié bloque', async () => {
    await expect(svc().s.decider(CHEF, 'D1', { decision: 'valider', delegations: [] })).rejects.toThrow('Livrable à confier');
  });
  it('valider : livrable confié à quelqu’un d’autre → accord N+1', async () => {
    const { s, majAvp } = svc();
    await s.decider(CHEF, 'D1', { decision: 'valider', delegations: [{ livrable: CLE, collaborateurId: 'X1' }] });
    expect(majAvp.mock.calls[0][0].data).toEqual({ responsableId: 'X1' });
  });
  it('on ne confie pas un livrable au demandeur lui-même', async () => {
    await expect(svc().s.decider(CHEF, 'D1', { decision: 'valider', delegations: [{ livrable: CLE, collaborateurId: 'COLLAB' }] })).rejects.toThrow(BadRequestException);
  });
  it('sous conditions : livrable non délégable avancé à la veille du départ', async () => {
    const { s, majAvp } = svc();
    await s.decider(CHEF, 'D1', { decision: 'sous_conditions', nonDelegables: [CLE] });
    expect(majAvp.mock.calls[0][0].data).toEqual({ echeance: '2026-10-04' });
  });
  it('autres dates : période valide exigée', async () => {
    await expect(svc().s.decider(CHEF, 'D1', { decision: 'autres_dates', dateDebut: '2026-10-10', dateFin: '2026-10-01' })).rejects.toThrow(BadRequestException);
  });
  it('demande déjà tranchée → 409', async () => {
    await expect(svc({ demande: { statut: 'validee' } }).s.decider(CHEF, 'D1', { decision: 'refuser', motif: 'periode_critique' })).rejects.toThrow(ConflictException);
  });
  it('N+1 « Dir. GC » : accepté pour le rôle Dir. GC, refusé pour un autre rôle', async () => {
    const dir = svc({ demande: { n1CollaborateurId: null, n1Role: 'Dir. GC' } });
    await expect(dir.s.decider({ ...CHEF, role: 'COO' }, 'D1', { decision: 'refuser', motif: 'periode_critique' })).rejects.toThrow(ForbiddenException);
    await expect(dir.s.decider({ ...CHEF, role: 'Dir. GC' }, 'D1', { decision: 'refuser', motif: 'periode_critique' })).resolves.toBeDefined();
  });
  it("N+1 « Dir. GC » : la Dir. GC d'une autre société du groupe ne décide pas", async () => {
    const dir = svc({ demande: { n1CollaborateurId: null, n1Role: 'Dir. GC' } });
    await expect(dir.s.decider({ ...CHEF, societeId: 'AUTRE', role: 'Dir. GC' }, 'D1', { decision: 'refuser', motif: 'periode_critique' })).rejects.toThrow(ForbiddenException);
  });
});

describe('DemandesService.deposerAbsence (N+1 selon le compte)', () => {
  const CONGE = { type: 'conge_paye' as const, dateDebut: '2026-10-05', dateFin: '2026-10-09' };
  const deposer = (role: string, moi?: object | null) => svc({ moi }).s.deposerAbsence({ userId: 'U', societeId: 'S', role }, CONGE);
  it('collaborateur : chef de sa cellule, sinon Dir. GC', async () => {
    const membre = { id: 'DOS1', collaborateur: { id: 'C1', cellule: { id: 'CEL', dispatcherId: 'CHEF' } } };
    await expect(deposer('collaborateur', membre)).resolves.toMatchObject({ n1CollaborateurId: 'CHEF' });
    const chef = { id: 'DOS1', collaborateur: { id: 'CHEF', cellule: { id: 'CEL', dispatcherId: 'CHEF' } } };
    await expect(deposer('collaborateur', chef)).resolves.toMatchObject({ n1Role: 'Dir. GC' });
  });
  it('direction : Dir. GC → CTO ; Salarié → Dir. GC ; rôle sans circuit défini refusé', async () => {
    await expect(deposer('Dir. GC')).resolves.toMatchObject({ n1Role: 'CTO (transverse)' });
    await expect(deposer('Salarié')).resolves.toMatchObject({ n1Role: 'Dir. GC' });
    await expect(deposer('RH')).rejects.toThrow(ConflictException);
  });
  it('directeurs (COO, CFO, CTO, CIO) → CEO ; le CEO va directement à la RH', async () => {
    for (const role of ['COO', 'CFO', 'CTO (transverse)', 'CIO (transverse)']) {
      await expect(deposer(role)).resolves.toMatchObject({ n1Role: 'CEO (transverse)', statut: 'attente_n1' });
    }
    await expect(deposer('CEO (transverse)')).resolves.toMatchObject({ n1Role: null, statut: 'accord_n1' });
  });
  it('N+1 « CEO » : le CEO décide pour un directeur', async () => {
    const ceo = svc({ demande: { n1CollaborateurId: null, n1Role: 'CEO (transverse)' } });
    await expect(ceo.s.decider({ ...CHEF, role: 'CTO (transverse)' }, 'D1', { decision: 'refuser', motif: 'periode_critique' })).rejects.toThrow(ForbiddenException);
    await expect(ceo.s.decider({ ...CHEF, role: 'CEO (transverse)' }, 'D1', { decision: 'refuser', motif: 'periode_critique' })).resolves.toBeDefined();
  });
  it('compte sans dossier du personnel → 404', async () => {
    await expect(deposer('collaborateur', null)).rejects.toThrow('Aucun dossier');
  });
  it('maquette : motif facultatif pour un congé payé, requis sinon', async () => {
    const maladie = { type: 'maladie' as const, dateDebut: '2026-10-05', dateFin: '2026-10-06' };
    await expect(svc().s.deposerAbsence({ userId: 'U', societeId: 'S', role: 'Salarié' }, maladie)).rejects.toThrow('motif est requis');
  });
});

describe('DemandesService.deposerRemboursement', () => {
  it('maquette : facture et ordonnance obligatoires', async () => {
    const corps = { categorie: 'consultation' as const, beneficiaire: 'moi' as const, dateSoins: '2026-09-28', montant: 25_000 };
    await expect(svc().s.deposerRemboursement({ userId: 'U', societeId: 'S', role: 'Salarié' }, corps)).rejects.toThrow('facture');
  });
});

describe('DemandesService.validationRh', () => {
  it('exige l’accord du N+1', async () => {
    await expect(svc().s.validationRh(CHEF, 'D1', true)).rejects.toThrow(ConflictException);
  });
  it('refus RH : motif obligatoire', async () => {
    await expect(svc({ demande: { statut: 'accord_n1' } }).s.validationRh(CHEF, 'D1', false)).rejects.toThrow(BadRequestException);
  });
});
