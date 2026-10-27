import { ForbiddenException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAssignmentService } from './task-assignment.service';

// Revue CTO (21/10/2026) : assigner, c'est organiser le travail — le CTO
// n'assigne qu'en suppléance d'un Dir. GC absent.
describe('TaskAssignmentService.assign · CTO', () => {
  function svc(dirGcAbsent: boolean) {
    const prisma = {
      utilisateurSocieteRole: {
        findMany: jest.fn(({ where }: { where: { role: { nom: string } } }) =>
          Promise.resolve(where.role.nom === 'Dir. GC' ? [{ utilisateurId: 'DG' }] : [{ utilisateurId: 'CTO' }]),
        ),
      },
      demandeAbsence: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            dirGcAbsent ? [{ suppleantId: null, dossier: { utilisateurId: 'DG', collaborateurId: null } }] : [],
          ),
      },
      collaborateur: { findMany: jest.fn().mockResolvedValue([]) },
      tacheProjet: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    return new TaskAssignmentService(prisma, {} as NotificationsService);
  }
  const cto = { userId: 'CTO', role: 'CTO (transverse)' };

  it('Dir. GC présent : le CTO n’assigne pas', async () => {
    await expect(svc(false).assign('S1', cto, 'P1', 'T1', 'C1', false)).rejects.toThrow(ForbiddenException);
  });

  it('Dir. GC absent sans suppléant : le CTO assigne (la tâche introuvable le prouve : la règle est passée)', async () => {
    await expect(svc(true).assign('S1', cto, 'P1', 'T1', 'C1', false)).rejects.toThrow('Tâche introuvable');
  });
});
