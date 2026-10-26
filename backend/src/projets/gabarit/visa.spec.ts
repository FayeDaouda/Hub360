import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import { TachesProjetService } from './taches-projet.service';

// Visa DPLG (revue Dir. GC, 21/10/2026) : l'architecte DPLG appose son visa
// sur une tâche validée qui l'exige, ou le refuse avec un motif (reprise).
describe('TachesProjetService.viser', () => {
  function svc(tache: object | null) {
    const maj = jest.fn().mockResolvedValue({ count: 1 });
    const evenement = jest.fn();
    const tx = { tacheProjet: { updateMany: maj }, evenementTacheProjet: { create: evenement } };
    const prisma = {
      tacheProjet: { findFirst: jest.fn().mockResolvedValue(tache) },
      collaborateur: {
        findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U-ASSIGNE', dossierPersonnel: null }]),
      },
      $transaction: jest.fn((f: (t: typeof tx) => Promise<unknown>) => f(tx)),
    } as unknown as PrismaService;
    const notifications = { pousser: jest.fn() } as unknown as NotificationsService;
    return { s: new TachesProjetService(prisma, notifications, {} as ReglagesService), maj, evenement, notifications };
  }
  const aViser = {
    id: 'T1',
    libelle: 'Plans d’exécution architecture',
    statut: 'validee',
    version: 2,
    visaRequis: true,
    visaLe: null,
    assigneId: 'C1',
    projet: { code: 'FS_POI.26' },
  };
  const dirGc = { userId: 'DG', role: 'Dir. GC' };

  it('le CTO ne vise pas à la place de l’architecte, même en suppléance', async () => {
    await expect(
      svc(aViser).s.viser('S1', { userId: 'CTO', role: 'CTO (transverse)' }, 'P1', 'T1', true),
    ).rejects.toThrow(ForbiddenException);
  });

  it('apposé : daté, signé, tracé ; l’assigné est prévenu', async () => {
    const { s, maj, evenement, notifications } = svc(aViser);
    expect(await s.viser('S1', dirGc, 'P1', 'T1', true)).toEqual({ visa: 'appose' });
    expect(maj).toHaveBeenCalledWith({
      where: { id: 'T1', statut: 'validee', visaLe: null },
      data: { visaLe: expect.any(Date), visaParId: 'DG' },
    });
    expect(evenement).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'visa', detail: 'Visa DPLG apposé sur la remise v02' }),
    });
    expect(notifications.pousser).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tache_validee', destinataireIds: ['U-ASSIGNE'] }),
    );
  });

  it('refusé : motif obligatoire, la tâche repart en reprise', async () => {
    await expect(svc(aViser).s.viser('S1', dirGc, 'P1', 'T1', false)).rejects.toThrow(BadRequestException);
    const { s, maj, evenement } = svc(aViser);
    await s.viser('S1', dirGc, 'P1', 'T1', false, 'Cotes de réservation à reprendre');
    expect(maj).toHaveBeenCalledWith(
      expect.objectContaining({ data: { statut: 'reprise', valideeLe: null, valideeParId: null } }),
    );
    expect(evenement).toHaveBeenCalledWith({
      data: expect.objectContaining({
        detail: 'Visa DPLG refusé, remise v02 renvoyée en reprise : Cotes de réservation à reprendre',
      }),
    });
  });

  it('rien à viser : pas de visa exigé, pas encore validée, ou déjà visée', async () => {
    await expect(svc({ ...aViser, visaRequis: false }).s.viser('S1', dirGc, 'P1', 'T1', true)).rejects.toThrow(
      ConflictException,
    );
    await expect(svc({ ...aViser, statut: 'a_valider' }).s.viser('S1', dirGc, 'P1', 'T1', true)).rejects.toThrow(
      ConflictException,
    );
    await expect(svc({ ...aViser, visaLe: new Date() }).s.viser('S1', dirGc, 'P1', 'T1', true)).rejects.toThrow(
      ConflictException,
    );
  });
});
