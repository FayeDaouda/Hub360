import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PermisService } from './permis.service';

// Vague B — extension de la couverture service-level (Permis, après
// Facturation). Le modèle « bloc = 1 responsable + 1 échéance » a son propre
// guard (verifierResponsableOuAdmin), distinct de dispatch-acces.ts (déjà
// couvert ailleurs pour l'assignation elle-même) : ici on teste qui peut
// AGIR sur un bloc une fois un responsable désigné (cocher un item, éditer
// le dossier), plus les effets de bord (horodatages de statut, notifications).

const PROJET = { id: 'P1', categorie: 'conception', programme: 'Villa X', code: 'PRJ-1', cellules: [] };
const PERMIS_VIDE = {
  projetId: 'P1',
  statut: 'a_deposer',
  dateObtention: null,
  dateRefus: null,
  titrePropriete: false,
  planCadastralVise: false,
  plansApd: false,
  devis: false,
  timbreFiscal: false,
};

function mockPrisma() {
  const permis = {
    upsert: jest.fn().mockResolvedValue(PERMIS_VIDE),
    update: jest.fn(),
  };
  const ligneChecklistPermis = {
    count: jest.fn().mockResolvedValue(1), // gabarit déjà amorcé — pas de re-seed
    createMany: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn().mockResolvedValue({ _max: { ordre: null } }),
    create: jest.fn(),
  };
  const blocPermis = {
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
    permis,
    ligneChecklistPermis,
    blocPermis,
    collaborateur,
    projet,
    imageProjet,
    fichierProjet,
    // joindreImages/joindreFichiers postent le fichier ET marquent l'item
    // fait en une transaction (cf. marquerFaitApresUpload) — mock minimal qui
    // exécute juste les opérations déjà déclenchées (forme « tableau »).
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  return { prisma, permis, ligneChecklistPermis, blocPermis, collaborateur, projet, fichierProjet };
}

function mockNotifications() {
  const pousser = jest.fn().mockResolvedValue(undefined);
  const adminsDeSociete = jest.fn().mockResolvedValue([]);
  return { pousser, adminsDeSociete } as unknown as NotificationsService;
}

function service(prisma: PrismaService, notifications = mockNotifications()) {
  return new PermisService(prisma, notifications);
}

// Un bloc « Dossier de permis » avec un responsable donné — le reste des
// méthodes de PermisService ne s'intéressent qu'à CE bloc pour leurs gardes.
function blocDossier(responsableId: string | null, over: Record<string, unknown> = {}) {
  return {
    permisId: 'P1',
    groupe: 'dossier_permis',
    echeance: null,
    responsableId,
    responsable: responsableId ? { id: responsableId, prenom: 'R', nom: 'X' } : null,
    prolongationDemandeeLe: null,
    prolongationEcheance: null,
    prolongationMotif: null,
    ...over,
  };
}

describe('PermisService — qui peut agir sur un bloc (verifierResponsableOuAdmin)', () => {
  it('admin : autorisé sans même chercher sa fiche collaborateur', async () => {
    const { prisma, blocPermis, ligneChecklistPermis, collaborateur } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('AUTRE')]);
    ligneChecklistPermis.findFirst.mockResolvedValue({ groupe: 'dossier_permis' });
    const svc = service(prisma);
    await expect(
      svc.patchLigneChecklist('S1', 'P1', 'L1', { fait: true }, 'U1', 'societe_admin'),
    ).resolves.toBeDefined();
    expect(collaborateur.findFirst).not.toHaveBeenCalled();
  });

  it('collaborateur qui N’EST PAS le responsable du bloc → 403', async () => {
    const { prisma, blocPermis, ligneChecklistPermis, collaborateur } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('RESPONSABLE')]);
    ligneChecklistPermis.findFirst.mockResolvedValue({ groupe: 'dossier_permis' });
    collaborateur.findFirst.mockResolvedValue({ id: 'AUTRE_COLLAB' });
    const svc = service(prisma);
    await expect(
      svc.patchLigneChecklist('S1', 'P1', 'L1', { fait: true }, 'U1', 'collaborateur'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('aucune fiche collaborateur pour ce compte → 403', async () => {
    const { prisma, blocPermis, ligneChecklistPermis, collaborateur } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('RESPONSABLE')]);
    ligneChecklistPermis.findFirst.mockResolvedValue({ groupe: 'dossier_permis' });
    collaborateur.findFirst.mockResolvedValue(null);
    const svc = service(prisma);
    await expect(
      svc.patchLigneChecklist('S1', 'P1', 'L1', { fait: true }, 'U1', 'collaborateur'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('AUTORISÉ : le collaborateur EST le responsable désigné du bloc', async () => {
    const { prisma, blocPermis, ligneChecklistPermis, collaborateur } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('C1')]);
    ligneChecklistPermis.findFirst.mockResolvedValue({ groupe: 'dossier_permis' });
    collaborateur.findFirst.mockResolvedValue({ id: 'C1' });
    const svc = service(prisma);
    await expect(
      svc.patchLigneChecklist('S1', 'P1', 'L1', { fait: true }, 'U1', 'collaborateur'),
    ).resolves.toBeDefined();
    expect(ligneChecklistPermis.updateMany).toHaveBeenCalled();
  });
});

// Vague B (Fichiers/Images) — la vraie jonction fichier↔checklist : joindre
// depuis une ligne crée directement la ligne FichierProjet avec sa FK posée
// (pas un lien vers une copie séparée — une seule ligne lue à la fois par la
// checklist ET par Documents/Images, donc pas de duplication de stockage à
// tester séparément, c'est une propriété du schéma). Le guard réutilise
// verifierResponsableOuAdmin (déjà couvert ci-dessus via patchLigneChecklist)
// — on vérifie ici qu'il est bien câblé DANS ce chemin précis, pas ré-testé
// en détail.
describe('PermisService.joindreFichiers', () => {
  const DTO = { fichiers: [{ nom: 'plan.pdf', url: 'data:application/pdf;base64,AA==' }] };

  it('ligne de checklist introuvable (mauvais id ou autre permis) → 404, rien créé', async () => {
    const { prisma, ligneChecklistPermis, fichierProjet } = mockPrisma();
    ligneChecklistPermis.findFirst.mockResolvedValue(null);
    const svc = service(prisma);
    await expect(
      svc.joindreFichiers('S1', 'P1', 'INEXISTANTE', DTO, 'U1', 'societe_admin'),
    ).rejects.toThrow(NotFoundException);
    expect(fichierProjet.createMany).not.toHaveBeenCalled();
  });

  it('collaborateur qui n’est pas le responsable du bloc → 403, rien créé (guard bien câblé sur ce chemin)', async () => {
    const { prisma, blocPermis, ligneChecklistPermis, collaborateur, fichierProjet } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('RESPONSABLE')]);
    ligneChecklistPermis.findFirst.mockResolvedValue({ groupe: 'dossier_permis' });
    collaborateur.findFirst.mockResolvedValue({ id: 'AUTRE_COLLAB' });
    const svc = service(prisma);
    await expect(
      svc.joindreFichiers('S1', 'P1', 'L1', DTO, 'U1', 'collaborateur'),
    ).rejects.toThrow(ForbiddenException);
    expect(fichierProjet.createMany).not.toHaveBeenCalled();
  });

  it('AUTORISÉ : le responsable désigné joint un fichier — la FK checklist est posée à la création (pas un lien séparé)', async () => {
    const { prisma, blocPermis, ligneChecklistPermis, collaborateur, fichierProjet } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('C1')]);
    ligneChecklistPermis.findFirst.mockResolvedValue({ groupe: 'dossier_permis' });
    collaborateur.findFirst.mockResolvedValue({ id: 'C1' });
    const svc = service(prisma);
    await svc.joindreFichiers('S1', 'P1', 'L1', DTO, 'U1', 'collaborateur');
    expect(fichierProjet.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          projetId: 'P1',
          nom: 'plan.pdf',
          phase: 'permis',
          ligneChecklistPermisId: 'L1',
          ajouteParId: 'U1',
        }),
      ],
    });
  });

  it('admin : autorisé sans chercher sa fiche collaborateur, même chemin que patchLigneChecklist', async () => {
    const { prisma, blocPermis, ligneChecklistPermis, collaborateur, fichierProjet } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('AUTRE')]);
    ligneChecklistPermis.findFirst.mockResolvedValue({ groupe: 'dossier_permis' });
    const svc = service(prisma);
    await svc.joindreFichiers('S1', 'P1', 'L1', DTO, 'U1', 'societe_admin');
    expect(collaborateur.findFirst).not.toHaveBeenCalled();
    expect(fichierProjet.createMany).toHaveBeenCalled();
  });
});

describe('PermisService.patch — horodatages de statut', () => {
  it('passage à « obtenu » sans date déjà posée → dateObtention = maintenant', async () => {
    const { prisma, permis, blocPermis } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('C1')]);
    const svc = service(prisma);
    await svc.patch('S1', 'P1', { statut: 'obtenu' }, 'U1', 'societe_admin');
    const data = permis.update.mock.calls[0][0].data;
    expect(data.statut).toBe('obtenu');
    expect(data.dateObtention).toBeInstanceOf(Date);
  });

  it('déjà « obtenu » avec une date existante → ne l’écrase PAS en repatchant autre chose', async () => {
    const { prisma, permis, blocPermis } = mockPrisma();
    permis.upsert.mockResolvedValue({
      ...PERMIS_VIDE,
      statut: 'obtenu',
      dateObtention: new Date('2026-01-15'),
    });
    blocPermis.findMany.mockResolvedValue([blocDossier('C1')]);
    const svc = service(prisma);
    // Un patch qui ne touche pas explicitement `statut` (reste « obtenu » via actuel.statut).
    await svc.patch('S1', 'P1', { dossier: { titre_propriete: true } }, 'U1', 'societe_admin');
    const data = permis.update.mock.calls[0][0].data;
    expect(data.dateObtention).toBeUndefined(); // pas touché, donc pas écrasé
  });

  it('retour à « a_deposer » → dateObtention ET dateRefus effacées (deviendraient trompeuses)', async () => {
    const { prisma, permis, blocPermis } = mockPrisma();
    permis.upsert.mockResolvedValue({
      ...PERMIS_VIDE,
      statut: 'refuse',
      dateRefus: new Date('2026-01-15'),
    });
    blocPermis.findMany.mockResolvedValue([blocDossier('C1')]);
    const svc = service(prisma);
    await svc.patch('S1', 'P1', { statut: 'a_deposer' }, 'U1', 'societe_admin');
    const data = permis.update.mock.calls[0][0].data;
    expect(data.dateObtention).toBeNull();
    expect(data.dateRefus).toBeNull();
  });
});

describe('PermisService.patchBloc — notification uniquement sur une VRAIE nouvelle désignation', () => {
  it('nouveau responsable désigné (bloc libre) → notification envoyée à cette personne', async () => {
    const { prisma, blocPermis, collaborateur } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier(null)]);
    collaborateur.findUnique.mockResolvedValue({ utilisateurId: 'UTIL_CIBLE' });
    const notifications = mockNotifications();
    const svc = service(prisma, notifications);
    await svc.patchBloc(
      'S1',
      'P1',
      'dossier_permis',
      { responsableId: 'C2' },
      'U1',
      'societe_admin',
    );
    expect(notifications.pousser).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'checklist_assignee', destinataireIds: ['UTIL_CIBLE'] }),
    );
  });

  it('ré-assignation à la MÊME personne → aucune notification (pas un vrai changement)', async () => {
    const { prisma, blocPermis } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('C2')]);
    const notifications = mockNotifications();
    const svc = service(prisma, notifications);
    await svc.patchBloc(
      'S1',
      'P1',
      'dossier_permis',
      { responsableId: 'C2', echeance: '2026-12-01' },
      'U1',
      'societe_admin',
    );
    expect(notifications.pousser).not.toHaveBeenCalled();
  });

  it('désassignation (responsableId: null) → aucune notification', async () => {
    const { prisma, blocPermis } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('C2')]);
    const notifications = mockNotifications();
    const svc = service(prisma, notifications);
    await svc.patchBloc('S1', 'P1', 'dossier_permis', { responsableId: null }, 'U1', 'societe_admin');
    expect(notifications.pousser).not.toHaveBeenCalled();
  });
});

describe('PermisService.demanderProlongationBloc', () => {
  it('collaborateur qui n’est PAS le responsable de CE bloc → 403', async () => {
    const { prisma, blocPermis, collaborateur } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('RESPONSABLE')]);
    collaborateur.findFirst.mockResolvedValue({ id: 'AUTRE' });
    const svc = service(prisma);
    await expect(
      svc.demanderProlongationBloc(
        'S1',
        'P1',
        'dossier_permis',
        { echeance: '2026-12-01' },
        'U1',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('AUTORISÉ : le responsable du bloc demande sa propre prolongation, les admins sont notifiés', async () => {
    const { prisma, blocPermis, collaborateur } = mockPrisma();
    blocPermis.findMany.mockResolvedValue([blocDossier('C1')]);
    collaborateur.findFirst.mockResolvedValue({ id: 'C1' });
    const notifications = mockNotifications();
    (notifications.adminsDeSociete as jest.Mock).mockResolvedValue(['ADMIN1', 'ADMIN2']);
    const svc = service(prisma, notifications);
    await svc.demanderProlongationBloc(
      'S1',
      'P1',
      'dossier_permis',
      { echeance: '2026-12-01', motif: 'Retard mairie' },
      'U1',
    );
    expect(notifications.pousser).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'prolongation_demandee',
        destinataireIds: ['ADMIN1', 'ADMIN2'],
      }),
    );
  });
});

describe('PermisService.deciderProlongationBloc', () => {
  it('bloc introuvable → 404', async () => {
    const { prisma, blocPermis } = mockPrisma();
    blocPermis.findUnique.mockResolvedValue(null);
    const svc = service(prisma);
    await expect(
      svc.deciderProlongationBloc('S1', 'P1', 'dossier_permis', { accepter: true }, 'U1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('aucune demande en attente → 409', async () => {
    const { prisma, blocPermis } = mockPrisma();
    blocPermis.findUnique.mockResolvedValue(blocDossier('C1', { prolongationDemandeeLe: null }));
    const svc = service(prisma);
    await expect(
      svc.deciderProlongationBloc('S1', 'P1', 'dossier_permis', { accepter: true }, 'U1'),
    ).rejects.toThrow(ConflictException);
  });

  it('acceptée : l’échéance du bloc est reportée à la date proposée', async () => {
    const { prisma, blocPermis, collaborateur } = mockPrisma();
    blocPermis.findUnique.mockResolvedValue(
      blocDossier('C1', {
        prolongationDemandeeLe: new Date(),
        prolongationEcheance: '2026-12-31',
      }),
    );
    collaborateur.findUnique.mockResolvedValue({ utilisateurId: 'UTIL_C1' });
    const svc = service(prisma);
    await svc.deciderProlongationBloc('S1', 'P1', 'dossier_permis', { accepter: true }, 'U1');
    const data = blocPermis.update.mock.calls[0][0].data;
    expect(data.echeance).toBe('2026-12-31');
    expect(data.prolongationDemandeeLe).toBeNull();
  });

  it('refusée : l’échéance reste INCHANGÉE, seule la demande est effacée', async () => {
    const { prisma, blocPermis, collaborateur } = mockPrisma();
    blocPermis.findUnique.mockResolvedValue(
      blocDossier('C1', {
        prolongationDemandeeLe: new Date(),
        prolongationEcheance: '2026-12-31',
      }),
    );
    collaborateur.findUnique.mockResolvedValue({ utilisateurId: 'UTIL_C1' });
    const svc = service(prisma);
    await svc.deciderProlongationBloc('S1', 'P1', 'dossier_permis', { accepter: false }, 'U1');
    const data = blocPermis.update.mock.calls[0][0].data;
    expect(data.echeance).toBeUndefined();
    expect(data.prolongationDemandeeLe).toBeNull();
  });
});
