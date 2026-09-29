import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TachesService } from './taches.service';

const PROJET = { id: 'P1', code: 'PN_S.26', programme: 'Villa', societeId: 'S', cellules: [{ celluleId: 'CEL' }] };
const RESP = { id: 'C1', prenom: 'Awa', nom: 'Ndiaye', utilisateurId: 'U-AWA', cellule: { dispatcherId: 'CHEF' } };
const BLOC = { debut: '2026-09-14', echeance: '2026-09-18', responsable: RESP, permis: { projet: PROJET } };
const K = { section: 'permis' as const, projetId: 'P1', groupe: 'dossier_permis' };
const REMIS = { ...K, remisLe: new Date('2026-09-17T10:00:00Z'), valideLe: null, renvoyeLe: null, renvoiMotif: '' };

function svc(o: { bloc?: object; validation?: object | null; fiche?: string | null } = {}) {
  const bloc = { ...BLOC, ...o.bloc };
  const prisma = {
    dossierPersonnel: { findFirst: jest.fn().mockResolvedValue({ collaborateurId: 'C1', absences: [] }) },
    collaborateur: {
      findFirst: jest.fn().mockResolvedValue(o.fiche === undefined ? { id: 'CHEF' } : o.fiche ? { id: o.fiche } : null),
      findUnique: jest.fn().mockResolvedValue({ utilisateurId: 'U-CHEF' }),
    },
    blocPermis: {
      findUnique: jest.fn().mockResolvedValue(bloc),
      findMany: jest.fn().mockResolvedValue([{ groupe: 'dossier_permis', debut: bloc.debut, echeance: bloc.echeance, responsableId: 'C1', permis: { projet: PROJET } }]),
    },
    blocChecklistAvp: { findMany: jest.fn().mockResolvedValue([]) },
    blocExecution: { findMany: jest.fn().mockResolvedValue([]) },
    dureeStandardTache: { findMany: jest.fn().mockResolvedValue([]) },
    validationTache: {
      findMany: jest.fn().mockResolvedValue(o.validation ? [o.validation] : []),
      findUnique: jest.fn().mockResolvedValue(o.validation ?? null),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U-DIR' }]) },
  } as unknown as PrismaService;
  const notifications = { pousser: jest.fn() } as unknown as NotificationsService;
  return { s: new TachesService(prisma, notifications), prisma, notifications };
}
const AWA = { userId: 'U-AWA', societeId: 'S', role: 'collaborateur' };
const CHEF = { userId: 'U-CHEF', societeId: 'S', role: 'collaborateur' };

describe('TachesService', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-23T10:00:00Z')));
  afterAll(() => jest.useRealTimers());

  it('mes tâches : statut, motif de renvoi seulement tant que la tâche est à reprendre', async () => {
    const r = await svc({ validation: { ...K, remisLe: null, valideLe: null, renvoyeLe: new Date(), renvoiMotif: 'Plans incomplets' } }).s.mesTaches(AWA);
    expect(r.taches).toEqual([expect.objectContaining({ statut: 'a_reprendre', renvoiMotif: 'Plans incomplets' })]);
    const retard = await svc().s.mesTaches(AWA);
    expect(retard.taches[0]).toMatchObject({ statut: 'en_retard', renvoiMotif: null });
    expect(retard.stats).toMatchObject({ total: 1, enCours: 1, enRetard: 1 });
  });

  it('remise : réservée au responsable, une seule fois, notifie le chef de cellule', async () => {
    await expect(svc().s.remettre(CHEF, K)).rejects.toThrow(ForbiddenException);
    await expect(svc({ validation: REMIS }).s.remettre(AWA, K)).rejects.toThrow(ConflictException);
    const { s, prisma, notifications } = svc();
    await s.remettre(AWA, K);
    expect(prisma.validationTache.upsert).toHaveBeenCalled();
    expect(notifications.pousser).toHaveBeenCalledWith(expect.objectContaining({ type: 'tache_remise', destinataireIds: ['U-CHEF'] }));
  });

  it('remise d’un chef de cellule : notifie le Dir. GC de la société', async () => {
    const { s, notifications } = svc({ bloc: { responsable: { ...RESP, id: 'CHEF', cellule: { dispatcherId: 'CHEF' } } } });
    await s.remettre(AWA, K);
    expect(notifications.pousser).toHaveBeenCalledWith(expect.objectContaining({ destinataireIds: ['U-DIR'] }));
  });

  it('décision : N+1 seulement, motif exigé pour un renvoi, admin de la société autorisé', async () => {
    await expect(svc({ validation: REMIS, fiche: 'AUTRE' }).s.decider(CHEF, K, { decision: 'valider' })).rejects.toThrow(ForbiddenException);
    await expect(svc({ validation: REMIS }).s.decider({ ...CHEF, societeId: 'AUTRE' }, K, { decision: 'valider' })).rejects.toThrow(ForbiddenException);
    await expect(svc({ validation: REMIS }).s.decider(CHEF, K, { decision: 'renvoyer', motif: ' ' })).rejects.toThrow(BadRequestException);
    await expect(svc().s.decider(CHEF, K, { decision: 'valider' })).rejects.toThrow(ConflictException);
    const { s, prisma, notifications } = svc({ validation: REMIS });
    await s.decider(CHEF, K, { decision: 'renvoyer', motif: 'Plans incomplets' });
    expect(prisma.validationTache.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ remisLe: null, renvoiMotif: 'Plans incomplets' }) }));
    expect(notifications.pousser).toHaveBeenCalledWith(expect.objectContaining({ type: 'tache_renvoyee', destinataireIds: ['U-AWA'] }));
    const admin = svc({ validation: REMIS, fiche: null });
    await admin.s.decider({ userId: 'U-ADM', societeId: 'S', role: 'societe_admin' }, K, { decision: 'valider' });
    expect(admin.prisma.validationTache.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ valideParId: 'U-ADM' }) }));
  });

  it('à valider : seulement les remises dont on est le N+1', async () => {
    expect(await svc({ validation: REMIS }).s.aValider(CHEF)).toEqual([expect.objectContaining({ responsable: 'Awa Ndiaye', projetCode: 'PN_S.26' })]);
    expect(await svc({ validation: REMIS, fiche: 'AUTRE' }).s.aValider(CHEF)).toEqual([]);
    expect(await svc({ validation: REMIS, fiche: null }).s.aValider({ ...CHEF, role: 'Dir. GC' })).toEqual([]);
  });
});
