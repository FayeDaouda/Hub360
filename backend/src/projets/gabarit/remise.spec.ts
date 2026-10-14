import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { TachesProjetService } from './taches-projet.service';

// Remise d'une tâche : fichiers et commentaire facultatifs, rattachés à la
// version remise ; le valideur voit « sans fichier joint » sinon.
describe('TachesProjetService.remettre — fichiers', () => {
  function svc() {
    const evenement = jest.fn();
    const pieces = jest.fn();
    const tx = {
      tacheProjet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      evenementTacheProjet: { create: evenement },
      pieceRemiseTache: { createMany: pieces },
    };
    const prisma = {
      tacheProjet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'T1', libelle: 'Plan masse', statut: 'reprise', version: 1, temps: { type: 'fixe' }, assigneId: 'C1',
          carte: { desactivation: null, ouvreApres: [] },
          projet: { code: 'GC-01', cellules: [{ cellule: { dispatcherId: 'C2' } }] },
        }),
      },
      collaborateur: {
        findFirst: jest.fn().mockResolvedValue({ id: 'C1' }),
        findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U2', dossierPersonnel: null }]),
      },
      $transaction: jest.fn((f: (t: typeof tx) => Promise<unknown>) => f(tx)),
    } as unknown as PrismaService;
    const notifications = { pousser: jest.fn() } as unknown as NotificationsService;
    return { s: new TachesProjetService(prisma, notifications), evenement, pieces };
  }
  const acteur = { userId: 'U1', role: 'Salarié' };

  it('fichiers rattachés à la nouvelle version, commentaire dans l’historique', async () => {
    const { s, evenement, pieces } = svc();
    await s.remettre('S1', acteur, 'P1', 'T1', { pieces: [{ nom: 'plan.pdf', url: 'data:application/pdf;base64,AA' }], commentaire: ' corrigé ' });
    expect(pieces).toHaveBeenCalledWith({ data: [expect.objectContaining({ tacheId: 'T1', version: 2, nom: 'plan.pdf' })] });
    expect(evenement.mock.calls[0][0].data.detail).toBe('Remise v02 · 1 fichier · « corrigé »');
  });

  it('sans fichier : remise acceptée, signalée dans l’historique', async () => {
    const { s, evenement, pieces } = svc();
    await s.remettre('S1', acteur, 'P1', 'T1');
    expect(pieces).not.toHaveBeenCalled();
    expect(evenement.mock.calls[0][0].data.detail).toBe('Remise v02 · sans fichier joint');
  });

  it('refuse un fichier qui n’est pas un data URI', async () => {
    await expect(svc().s.remettre('S1', acteur, 'P1', 'T1', { pieces: [{ nom: 'x', url: 'http://ailleurs' }] })).rejects.toThrow(BadRequestException);
  });
});
