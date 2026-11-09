import { NotFoundException } from '@nestjs/common';
import { ROLE_CIO, ROLE_DIR_GC, ROLE_EMPLOYEE, ROLE_HOLDING_ADMIN } from '@hub/domain';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RightsService } from '../rights/rights.service';
import { ProjectThreadsService } from './project-threads.service';

// Fils de projet (09/11/2026) : un commentaire peut citer plusieurs
// personnes ; chacune est notifiée (sauf l'auteur) et garde son état « lue ».
describe('ProjectThreadsService · mentions multiples', () => {
  // `readers` : comptes qui peuvent lire le projet (rôle Dir. GC, Lecture de « projets »).
  function svc(readers: string[]) {
    const prisma = {
      carteProjet: {
        findFirst: jest.fn().mockResolvedValue({ id: 'K1', libelle: 'Esquisse', projet: { code: 'GB_TBD.26' } }),
      },
      utilisateurSocieteRole: {
        findMany: jest
          .fn()
          .mockResolvedValue(readers.map((id) => ({ utilisateurId: id, roleId: 'R-DIR', role: { nom: ROLE_DIR_GC } }))),
      },
      projet: { findFirst: jest.fn().mockResolvedValue({ cartes: [], cellules: [] }) },
      collaborateur: { findMany: jest.fn().mockResolvedValue([]) },
      commentaireProjet: {
        create: jest.fn().mockResolvedValue({ id: 'C1', auteur: { prenom: 'Awa', nom: 'Diop', nomAffiche: null } }),
        findMany: jest.fn(),
      },
      mentionCommentaireProjet: { findFirst: jest.fn(), update: jest.fn() },
      notification: { updateMany: jest.fn() },
    };
    const notifications = { pousser: jest.fn().mockResolvedValue(undefined) };
    const rights = { forRole: jest.fn().mockResolvedValue({ projets: 'L' }) };
    const s = new ProjectThreadsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      rights as unknown as RightsService,
    );
    return { s, prisma, notifications, rights };
  }

  it('crée une mention par personne (sans doublon, sans l’auteur) et notifie chacune', async () => {
    const { s, prisma, notifications } = svc(['U1', 'U2', 'U3']);
    await s.post('S1', { userId: 'U1' }, 'P1', {
      carteId: 'K1',
      texte: 'Voir @Bineta et @Cheikh',
      mentionIds: ['U2', 'U3', 'U2', 'U1'],
    });
    expect(prisma.commentaireProjet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mentions: { create: [{ utilisateurId: 'U2' }, { utilisateurId: 'U3' }] },
        }),
      }),
    );
    expect(notifications.pousser).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mention_projet', destinataireIds: ['U2', 'U3'] }),
    );
  });

  it('une personne inconnue, inactive, d’une autre société ou sans accès au projet est ignorée', async () => {
    const { s, prisma, notifications } = svc(['U2']);
    await s.post('S1', { userId: 'U1' }, 'P1', { carteId: 'K1', texte: 'Bonjour', mentionIds: ['U2', 'AUTRE'] });
    expect(prisma.commentaireProjet.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mentions: { create: [{ utilisateurId: 'U2' }] } }) }),
    );
    expect(notifications.pousser).toHaveBeenCalledWith(expect.objectContaining({ destinataireIds: ['U2'] }));
  });

  it('qui peut lire le projet : carte blanche, Lecture de « projets », Salarié de son périmètre seulement', async () => {
    const { s, prisma, rights } = svc([]);
    prisma.utilisateurSocieteRole.findMany.mockResolvedValue([
      { utilisateurId: 'CIO', roleId: 'R-CIO', role: { nom: ROLE_CIO } },
      { utilisateurId: 'DIR', roleId: 'R-DIR', role: { nom: ROLE_DIR_GC } },
      { utilisateurId: 'SANS', roleId: 'R-SANS', role: { nom: 'Rôle sans projets' } },
      { utilisateurId: 'HOLD', roleId: 'R-HOLD', role: { nom: ROLE_HOLDING_ADMIN } },
      { utilisateurId: 'SAL-TACHE', roleId: 'R-SAL', role: { nom: ROLE_EMPLOYEE } },
      { utilisateurId: 'SAL-EQUIPE', roleId: 'R-SAL', role: { nom: ROLE_EMPLOYEE } },
      { utilisateurId: 'SAL-AILLEURS', roleId: 'R-SAL', role: { nom: ROLE_EMPLOYEE } },
    ]);
    rights.forRole.mockImplementation((roleId: string) =>
      Promise.resolve(roleId === 'R-SANS' ? { crm: 'L' } : { projets: 'L' }),
    );
    prisma.projet.findFirst.mockResolvedValue({
      cartes: [{ taches: [{ assigneId: 'COL-1' }, { assigneId: null }] }],
      cellules: [{ cellule: { dispatcherId: null, membres: [{ id: 'COL-2' }] } }],
    });
    prisma.collaborateur.findMany.mockResolvedValue([
      { utilisateurId: 'SAL-TACHE', dossierPersonnel: null },
      { utilisateurId: null, dossierPersonnel: { utilisateurId: 'SAL-EQUIPE' } },
    ]);
    const readers = await s.projectReaders('S1', 'P1');
    expect([...readers].sort()).toEqual(['CIO', 'DIR', 'SAL-EQUIPE', 'SAL-TACHE']);
  });

  it('projet d’une autre société : 404', async () => {
    const { s, prisma } = svc([]);
    prisma.projet.findFirst.mockResolvedValue(null);
    await expect(s.projectReaders('S1', 'AUTRE')).rejects.toThrow(NotFoundException);
  });

  it('sans mention : aucune notification', async () => {
    const { s, notifications } = svc([]);
    await s.post('S1', { userId: 'U1' }, 'P1', { carteId: 'K1', texte: 'Note' });
    expect(notifications.pousser).not.toHaveBeenCalled();
  });

  it('« Mes tâches » : ne cherche que mes mentions, et « lue » est mon état, pas celui des autres', async () => {
    const { s, prisma } = svc([]);
    prisma.commentaireProjet.findMany.mockResolvedValue([
      {
        id: 'C1',
        texte: '@Bineta Sow @Cheikh Fall',
        creeLe: new Date('2026-11-09T10:00:00Z'),
        parentId: null,
        projetId: 'P1',
        carteId: 'K1',
        tacheId: null,
        auteur: { id: 'U1', prenom: 'Awa', nom: 'Diop', nomAffiche: null },
        mentions: [{ lueLe: null }],
        projet: { code: 'GB_TBD.26' },
        carte: { libelle: 'Esquisse' },
        tache: null,
      },
    ]);
    const [m] = await s.myMentions('S1', 'U2');
    expect(m).toMatchObject({ id: 'C1', lue: false, auteurId: 'U1', racineId: 'C1' });
    const args = prisma.commentaireProjet.findMany.mock.calls[0][0];
    expect(args.where.mentions).toEqual({ some: { utilisateurId: 'U2' } });
    expect(args.include.mentions).toEqual({ where: { utilisateurId: 'U2' }, select: { lueLe: true } });
  });

  it('« lue » : seule la mention de la personne connectée change', async () => {
    const { s, prisma } = svc([]);
    prisma.mentionCommentaireProjet.findFirst.mockResolvedValue({
      lueLe: null,
      commentaire: { id: 'C1', projetId: 'P1' },
    });
    await s.markMentionRead('S1', 'U2', 'C1');
    expect(prisma.mentionCommentaireProjet.update).toHaveBeenCalledWith({
      where: { commentaireId_utilisateurId: { commentaireId: 'C1', utilisateurId: 'U2' } },
      data: { lueLe: expect.any(Date) },
    });
  });

  it('« lue » d’une mention qui ne me vise pas → 404', async () => {
    const { s, prisma } = svc([]);
    prisma.mentionCommentaireProjet.findFirst.mockResolvedValue(null);
    await expect(s.markMentionRead('S1', 'U9', 'C1')).rejects.toThrow(NotFoundException);
  });
});
