import { ForbiddenException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAssignmentService } from './task-assignment.service';

// Conversation du projet : synchronisée après une assignation (sans effet ici).
const CHAT = { synchroniserCanalProjet: jest.fn().mockResolvedValue(null) } as never;

// Droits de départ du lot 5 (matrice, 31/10/2026), par rôle.
const DG = {
  projets: 'LE',
  'projets.assignation': 'E',
  'projets.validation': 'V',
  'projets.visa': 'V',
  'projets.prolongations': 'V',
  'projets.ts': 'E',
  'projets.fils': 'E',
  'projets.production': 'L',
};
const CTO_P = {
  projets: 'LE',
  'projets.assignation': 'E',
  'projets.validation': 'V',
  'projets.prolongations': 'V',
  'projets.ts': 'EV',
  'projets.fils': 'E',
  'projets.production': 'L',
};
const CEO_P = { projets: 'L', 'projets.fils': 'E', 'projets.production': 'L' };
const SAL = { projets: 'L', 'projets.fils': 'E' };

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
    return new TaskAssignmentService(prisma, {} as NotificationsService, CHAT);
  }
  const cto = { userId: 'CTO', role: 'CTO (transverse)', permissions: CTO_P };

  it('Dir. GC présent : le CTO n’assigne pas', async () => {
    await expect(svc(false).assign('S1', cto, 'P1', 'T1', 'C1', false)).rejects.toThrow(ForbiddenException);
  });

  it('Dir. GC absent sans suppléant : le CTO assigne (la tâche introuvable le prouve : la règle est passée)', async () => {
    await expect(svc(true).assign('S1', cto, 'P1', 'T1', 'C1', false)).rejects.toThrow('Tâche introuvable');
  });
});

// Chef d'équipe (29/10/2026) : il assigne le travail d'un projet de son équipe,
// aux seuls membres de son équipe ; un Salarié qui n'est chef d'aucune équipe
// du projet n'assigne pas.
describe('TaskAssignmentService · chef d’équipe', () => {
  const salarie = { userId: 'U1', role: 'Salarié', permissions: SAL };
  const tache = {
    id: 'T1',
    libelle: 'Plans',
    statut: 'a_faire',
    projet: { code: 'DS_NGO.26' },
    carte: { desactivation: null, taches: [{ id: 'T1', statut: 'a_faire' }] },
  };
  function svc(o: { chefDe: string[]; membreDe?: string | null }) {
    const tx = {
      tacheProjet: { findMany: jest.fn().mockResolvedValue([{ id: 'T1' }]), updateMany: jest.fn() },
      evenementTacheProjet: { createMany: jest.fn() },
    };
    const prisma = {
      collaborateur: {
        // Fiche du compte connecté (le chef), puis la personne assignée.
        findFirst: jest.fn(({ where }: { where: { id?: string } }) =>
          Promise.resolve(
            where.id
              ? { prenom: 'Awa', nom: 'Diop', celluleId: o.membreDe === undefined ? 'CEL1' : o.membreDe }
              : { id: 'CHEF' },
          ),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      projetCellule: { findMany: jest.fn().mockResolvedValue(o.chefDe.map((celluleId) => ({ celluleId }))) },
      tacheProjet: { findFirst: jest.fn().mockResolvedValue(tache) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const notifications = { envoyer: jest.fn(), comptesDe: jest.fn().mockResolvedValue([]) };
    return {
      prisma,
      s: new TaskAssignmentService(
        prisma as unknown as PrismaService,
        notifications as unknown as NotificationsService,
        CHAT,
      ),
    };
  }

  it('chef de l’équipe du projet : assigne un membre de son équipe', async () => {
    const { s } = svc({ chefDe: ['CEL1'] });
    await expect(s.assign('S1', salarie, 'P1', 'T1', 'C1', false)).resolves.toEqual({ modifiees: 1 });
  });

  it('chef d’équipe : une personne d’une autre équipe → 403', async () => {
    const { s } = svc({ chefDe: ['CEL1'], membreDe: 'CEL2' });
    await expect(s.assign('S1', salarie, 'P1', 'T1', 'C1', false)).rejects.toThrow('membres de son équipe');
  });

  it('Salarié chef d’aucune équipe du projet → 403', async () => {
    const { s } = svc({ chefDe: [] });
    await expect(s.assign('S1', salarie, 'P1', 'T1', 'C1', false)).rejects.toThrow(ForbiddenException);
  });

  it('personnes proposées au chef : les membres de ses équipes seulement', async () => {
    const { s, prisma } = svc({ chefDe: ['CEL1'] });
    await s.assignable('S1', salarie, 'P1');
    expect(prisma.collaborateur.findMany.mock.calls[0][0].where).toEqual({
      societeId: 'S1',
      celluleId: { in: ['CEL1'] },
    });
  });
});

// Bouton « Assigner le bloc » (30/10/2026) : toutes les tâches encore ouvertes
// de la carte, les validées et non nécessaires gardent leur personne.
describe('TaskAssignmentService.assignCard', () => {
  const dirgc = { userId: 'DG', role: 'Dir. GC', permissions: DG };
  function svc(card: object | null) {
    const tx = {
      tacheProjet: {
        findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(where.id.in.map((id) => ({ id }))),
        ),
        updateMany: jest.fn(),
      },
      evenementTacheProjet: { createMany: jest.fn() },
    };
    const prisma = {
      collaborateur: {
        findFirst: jest.fn().mockResolvedValue({ id: 'C1', prenom: 'Awa', nom: 'Diop', celluleId: 'X' }),
      },
      carteProjet: { findFirst: jest.fn().mockResolvedValue(card) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const notifications = { envoyer: jest.fn(), comptesDe: jest.fn().mockResolvedValue(['U-AWA']) };
    return {
      tx,
      notifications,
      s: new TaskAssignmentService(
        prisma as unknown as PrismaService,
        notifications as unknown as NotificationsService,
        CHAT,
      ),
    };
  }
  const carte = (o: object = {}) => ({
    libelle: 'Livrables',
    desactivation: null,
    projet: { code: 'DS_NGO.26' },
    taches: [
      { id: 'T1', statut: 'a_faire' },
      { id: 'T2', statut: 'validee' },
      { id: 'T3', statut: 'a_reprendre' },
      { id: 'T4', statut: 'non_necessaire' },
    ],
    ...o,
  });

  it('assigne les tâches ouvertes du bloc, une seule notification', async () => {
    const { s, tx, notifications } = svc(carte());
    await expect(s.assignCard('S1', dirgc, 'P1', 'K1', 'C1')).resolves.toEqual({ modifiees: 2 });
    expect(tx.tacheProjet.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['T1', 'T3'] } },
      data: { assigneId: 'C1' },
    });
    expect(notifications.envoyer).toHaveBeenCalledTimes(1);
    expect(notifications.envoyer.mock.calls[0][0].titre).toBe('Bloc assigné · DS_NGO.26 · Livrables (2 tâches)');
  });

  it('carte désactivée → 409', async () => {
    const { s } = svc(carte({ desactivation: 'hors programme' }));
    await expect(s.assignCard('S1', dirgc, 'P1', 'K1', 'C1')).rejects.toThrow('Carte désactivée');
  });

  it('bloc sans tâche ouverte → 409', async () => {
    const { s } = svc(carte({ taches: [{ id: 'T2', statut: 'validee' }] }));
    await expect(s.assignCard('S1', dirgc, 'P1', 'K1', 'C1')).rejects.toThrow('Aucune tâche ouverte');
  });
});
