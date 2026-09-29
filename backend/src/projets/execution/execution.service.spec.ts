import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionService } from './execution.service';

// Vague B — extension de la couverture service-level (Exécution, même modèle
// « bloc = 1 responsable + 1 échéance » que Permis, cf. permis.service.spec.ts
// pour le détail du raisonnement). Pas de méthode `patch()` ici (contrairement
// à Permis) : Exécution n'a pas d'en-tête avec un statut/horodatages propres.

const PROJET = { id: 'P1', categorie: 'chantier', programme: 'Villa X', code: 'PRJ-1', cellules: [] };

function mockPrisma() {
  const ligneChecklistExecution = {
    count: jest.fn().mockResolvedValue(1), // gabarit déjà amorcé — pas de re-seed
    createMany: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn().mockResolvedValue({ _max: { ordre: null } }),
    create: jest.fn(),
  };
  const blocExecution = {
    createMany: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const collaborateur = { findFirst: jest.fn(), findUnique: jest.fn() };
  const projet = { findFirst: jest.fn().mockResolvedValue(PROJET) };
  const imageProjet = { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() };
  const fichierProjet = { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() };
  const prisma = {
    ligneChecklistExecution,
    blocExecution,
    collaborateur,
    projet,
    imageProjet,
    fichierProjet,
    validationTache: { deleteMany: jest.fn() },
    // joindreImages/joindreFichiers postent le fichier ET marquent l'item
    // fait en une transaction (cf. marquerFaitApresUpload) — mock minimal.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  return { prisma, ligneChecklistExecution, blocExecution, collaborateur, projet, fichierProjet };
}

function mockNotifications() {
  const pousser = jest.fn().mockResolvedValue(undefined);
  const adminsDeSociete = jest.fn().mockResolvedValue([]);
  return { pousser, adminsDeSociete } as unknown as NotificationsService;
}

function service(prisma: PrismaService, notifications = mockNotifications()) {
  return new ExecutionService(prisma, notifications);
}

function blocEtudes(responsableId: string | null, over: Record<string, unknown> = {}) {
  return {
    projetId: 'P1',
    groupe: 'etudes',
    echeance: null,
    responsableId,
    responsable: responsableId ? { id: responsableId, prenom: 'R', nom: 'X' } : null,
    prolongationDemandeeLe: null,
    prolongationEcheance: null,
    prolongationMotif: null,
    ...over,
  };
}

describe('ExecutionService — qui peut agir sur un bloc (verifierResponsableOuAdmin)', () => {
  it('admin : autorisé sans même chercher sa fiche collaborateur', async () => {
    const { prisma, blocExecution, ligneChecklistExecution, collaborateur } = mockPrisma();
    blocExecution.findMany.mockResolvedValue([blocEtudes('AUTRE')]);
    ligneChecklistExecution.findFirst.mockResolvedValue({ groupe: 'etudes' });
    const svc = service(prisma);
    await expect(
      svc.patchLigneChecklist('S1', 'P1', 'L1', { fait: true }, 'U1', 'societe_admin'),
    ).resolves.toBeDefined();
    expect(collaborateur.findFirst).not.toHaveBeenCalled();
  });

  it('collaborateur qui N’EST PAS le responsable du bloc → 403', async () => {
    const { prisma, blocExecution, ligneChecklistExecution, collaborateur } = mockPrisma();
    blocExecution.findMany.mockResolvedValue([blocEtudes('RESPONSABLE')]);
    ligneChecklistExecution.findFirst.mockResolvedValue({ groupe: 'etudes' });
    collaborateur.findFirst.mockResolvedValue({ id: 'AUTRE_COLLAB' });
    const svc = service(prisma);
    await expect(
      svc.patchLigneChecklist('S1', 'P1', 'L1', { fait: true }, 'U1', 'collaborateur'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('AUTORISÉ : le collaborateur EST le responsable désigné du bloc', async () => {
    const { prisma, blocExecution, ligneChecklistExecution, collaborateur } = mockPrisma();
    blocExecution.findMany.mockResolvedValue([blocEtudes('C1')]);
    ligneChecklistExecution.findFirst.mockResolvedValue({ groupe: 'etudes' });
    collaborateur.findFirst.mockResolvedValue({ id: 'C1' });
    const svc = service(prisma);
    await expect(
      svc.patchLigneChecklist('S1', 'P1', 'L1', { fait: true }, 'U1', 'collaborateur'),
    ).resolves.toBeDefined();
    expect(ligneChecklistExecution.updateMany).toHaveBeenCalled();
  });
});

// Vague B (Fichiers/Images) — même raisonnement que
// permis.service.spec.ts#PermisService.joindreFichiers : la FK checklist est
// posée à la création de la ligne FichierProjet (pas un lien vers une copie
// séparée, donc pas de duplication de stockage à tester à part), et on
// vérifie que verifierResponsableOuAdmin (déjà couvert ci-dessus) est bien
// câblé sur CE chemin précis.
describe('ExecutionService.joindreFichiers', () => {
  const DTO = { fichiers: [{ nom: 'photo-chantier.jpg', url: 'data:image/jpeg;base64,AA==' }] };

  it('ligne de checklist introuvable → 404, rien créé', async () => {
    const { prisma, ligneChecklistExecution, fichierProjet } = mockPrisma();
    ligneChecklistExecution.findFirst.mockResolvedValue(null);
    const svc = service(prisma);
    await expect(
      svc.joindreFichiers('S1', 'P1', 'INEXISTANTE', DTO, 'U1', 'societe_admin'),
    ).rejects.toThrow(NotFoundException);
    expect(fichierProjet.createMany).not.toHaveBeenCalled();
  });

  it('collaborateur qui n’est pas le responsable du bloc → 403, rien créé', async () => {
    const { prisma, blocExecution, ligneChecklistExecution, collaborateur, fichierProjet } = mockPrisma();
    blocExecution.findMany.mockResolvedValue([blocEtudes('RESPONSABLE')]);
    ligneChecklistExecution.findFirst.mockResolvedValue({ groupe: 'etudes' });
    collaborateur.findFirst.mockResolvedValue({ id: 'AUTRE_COLLAB' });
    const svc = service(prisma);
    await expect(
      svc.joindreFichiers('S1', 'P1', 'L1', DTO, 'U1', 'collaborateur'),
    ).rejects.toThrow(ForbiddenException);
    expect(fichierProjet.createMany).not.toHaveBeenCalled();
  });

  it('AUTORISÉ : le responsable désigné joint un fichier — la FK checklist est posée à la création', async () => {
    const { prisma, blocExecution, ligneChecklistExecution, collaborateur, fichierProjet } = mockPrisma();
    blocExecution.findMany.mockResolvedValue([blocEtudes('C1')]);
    ligneChecklistExecution.findFirst.mockResolvedValue({ groupe: 'etudes' });
    collaborateur.findFirst.mockResolvedValue({ id: 'C1' });
    const svc = service(prisma);
    await svc.joindreFichiers('S1', 'P1', 'L1', DTO, 'U1', 'collaborateur');
    expect(fichierProjet.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          projetId: 'P1',
          nom: 'photo-chantier.jpg',
          phase: 'chantier',
          ligneChecklistExecutionId: 'L1',
          ajouteParId: 'U1',
        }),
      ],
    });
  });
});

describe('ExecutionService.patchBloc — notification uniquement sur une VRAIE nouvelle désignation', () => {
  it('nouveau responsable désigné (bloc libre) → notification envoyée à cette personne', async () => {
    const { prisma, blocExecution, collaborateur } = mockPrisma();
    blocExecution.findMany.mockResolvedValue([blocEtudes(null)]);
    collaborateur.findUnique.mockResolvedValue({ utilisateurId: 'UTIL_CIBLE' });
    const notifications = mockNotifications();
    const svc = service(prisma, notifications);
    await svc.patchBloc('S1', 'P1', 'etudes', { responsableId: 'C2' }, 'U1', 'societe_admin');
    expect(notifications.pousser).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'checklist_assignee', destinataireIds: ['UTIL_CIBLE'] }),
    );
  });

  it('ré-assignation à la MÊME personne → aucune notification (pas un vrai changement)', async () => {
    const { prisma, blocExecution } = mockPrisma();
    blocExecution.findMany.mockResolvedValue([blocEtudes('C2')]);
    const notifications = mockNotifications();
    const svc = service(prisma, notifications);
    await svc.patchBloc(
      'S1',
      'P1',
      'etudes',
      { responsableId: 'C2', echeance: '2026-12-01' },
      'U1',
      'societe_admin',
    );
    expect(notifications.pousser).not.toHaveBeenCalled();
  });

  it('désassignation (responsableId: null) → aucune notification', async () => {
    const { prisma, blocExecution } = mockPrisma();
    blocExecution.findMany.mockResolvedValue([blocEtudes('C2')]);
    const notifications = mockNotifications();
    const svc = service(prisma, notifications);
    await svc.patchBloc('S1', 'P1', 'etudes', { responsableId: null }, 'U1', 'societe_admin');
    expect(notifications.pousser).not.toHaveBeenCalled();
  });

  it('HORS PÉRIMÈTRE : collaborateur ni admin ni dispatcher ni auto-assignation → 403, bloc inchangé', async () => {
    const { prisma, blocExecution } = mockPrisma();
    blocExecution.findMany.mockResolvedValue([blocEtudes('AUTRE')]); // déjà pris par quelqu'un d'autre
    const svc = service(prisma);
    await expect(
      svc.patchBloc('S1', 'P1', 'etudes', { responsableId: 'C1' }, 'U1', 'collaborateur'),
    ).rejects.toThrow(ForbiddenException);
    expect(blocExecution.update).not.toHaveBeenCalled();
  });
});

describe('ExecutionService.demanderProlongationBloc', () => {
  it('collaborateur qui n’est PAS le responsable de CE bloc → 403', async () => {
    const { prisma, blocExecution, collaborateur } = mockPrisma();
    blocExecution.findMany.mockResolvedValue([blocEtudes('RESPONSABLE')]);
    collaborateur.findFirst.mockResolvedValue({ id: 'AUTRE' });
    const svc = service(prisma);
    await expect(
      svc.demanderProlongationBloc('S1', 'P1', 'etudes', { echeance: '2026-12-01' }, 'U1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('AUTORISÉ : le responsable du bloc demande sa propre prolongation, les admins sont notifiés', async () => {
    const { prisma, blocExecution, collaborateur } = mockPrisma();
    blocExecution.findMany.mockResolvedValue([blocEtudes('C1')]);
    collaborateur.findFirst.mockResolvedValue({ id: 'C1' });
    const notifications = mockNotifications();
    (notifications.adminsDeSociete as jest.Mock).mockResolvedValue(['ADMIN1']);
    const svc = service(prisma, notifications);
    await svc.demanderProlongationBloc(
      'S1',
      'P1',
      'etudes',
      { echeance: '2026-12-01', motif: 'Attente BET' },
      'U1',
    );
    expect(notifications.pousser).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'prolongation_demandee', destinataireIds: ['ADMIN1'] }),
    );
  });
});

describe('ExecutionService.deciderProlongationBloc', () => {
  it('bloc introuvable → 404', async () => {
    const { prisma, blocExecution } = mockPrisma();
    blocExecution.findUnique.mockResolvedValue(null);
    const svc = service(prisma);
    await expect(
      svc.deciderProlongationBloc('S1', 'P1', 'etudes', { accepter: true }, 'U1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('aucune demande en attente → 409', async () => {
    const { prisma, blocExecution } = mockPrisma();
    blocExecution.findUnique.mockResolvedValue(blocEtudes('C1', { prolongationDemandeeLe: null }));
    const svc = service(prisma);
    await expect(
      svc.deciderProlongationBloc('S1', 'P1', 'etudes', { accepter: true }, 'U1'),
    ).rejects.toThrow(ConflictException);
  });

  it('acceptée : l’échéance du bloc est reportée à la date proposée', async () => {
    const { prisma, blocExecution, collaborateur } = mockPrisma();
    blocExecution.findUnique.mockResolvedValue(
      blocEtudes('C1', { prolongationDemandeeLe: new Date(), prolongationEcheance: '2026-12-31' }),
    );
    collaborateur.findUnique.mockResolvedValue({ utilisateurId: 'UTIL_C1' });
    const svc = service(prisma);
    await svc.deciderProlongationBloc('S1', 'P1', 'etudes', { accepter: true }, 'U1');
    const data = blocExecution.update.mock.calls[0][0].data;
    expect(data.echeance).toBe('2026-12-31');
    expect(data.prolongationDemandeeLe).toBeNull();
  });

  it('refusée : l’échéance reste INCHANGÉE, seule la demande est effacée', async () => {
    const { prisma, blocExecution, collaborateur } = mockPrisma();
    blocExecution.findUnique.mockResolvedValue(
      blocEtudes('C1', { prolongationDemandeeLe: new Date(), prolongationEcheance: '2026-12-31' }),
    );
    collaborateur.findUnique.mockResolvedValue({ utilisateurId: 'UTIL_C1' });
    const svc = service(prisma);
    await svc.deciderProlongationBloc('S1', 'P1', 'etudes', { accepter: false }, 'U1');
    const data = blocExecution.update.mock.calls[0][0].data;
    expect(data.echeance).toBeUndefined();
    expect(data.prolongationDemandeeLe).toBeNull();
  });
});
