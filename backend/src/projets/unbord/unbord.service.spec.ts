import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UnbordService } from './unbord.service';

// Vague B (Fichiers/Images), mis à jour 2026-09-25 pour l'assignation par
// bloc (remplace le fallback « toute l'équipe, aucun guard » — préservé
// seulement quand le bloc est LIBRE, cf. mémoire unbord-gabarit-societe).
// Toujours : amorçage depuis le gabarit actif de la société, item
// introuvable → 404, dérivation du statut (nonRequise prioritaire).

const PROJET = { id: 'P1', code: 'PRJ-1', programme: 'Villa X', categorie: 'conception', cellules: [] };

function ligneGabarit(id: string, groupe: string, libelle: string, ordre: number) {
  return { id, societeId: 'S1', groupe, libelle, ordre, supprimeLe: null };
}

function ligneProjet(id: string, gabaritId: string, groupe: string, libelle: string, ordre: number, over: Record<string, unknown> = {}) {
  return { id, projetId: 'P1', gabaritId, groupe, libelle, fait: false, nonRequise: false, gabarit: { ordre }, ...over };
}

function blocUnbord(groupe: string, responsableId: string | null) {
  return {
    projetId: 'P1',
    groupe,
    responsableId,
    responsable: responsableId ? { id: responsableId, prenom: 'R', nom: 'X' } : null,
  };
}

const GABARIT_DEFAUT = [
  ligneGabarit('G-plan_cadastral', 'documents', 'Plan cadastral', 0),
  ligneGabarit('G-ninea', 'documents', 'Ninéa', 1),
];
const BLOCS_DEFAUT = [blocUnbord('documents', null), blocUnbord('releve_existant', null)];

function mockPrisma(opts: {
  gabarit?: unknown[];
  lignesProjet?: unknown[];
  blocs?: unknown[];
  blocUnique?: unknown;
  images?: unknown[];
  fichiers?: unknown[];
  collaborateur?: unknown;
} = {}) {
  const ligneUnbordGabarit = {
    findMany: jest.fn().mockResolvedValue(opts.gabarit ?? GABARIT_DEFAUT),
  };
  const lignesProjetParDefaut =
    opts.lignesProjet ??
    GABARIT_DEFAUT.map((g) => ligneProjet(`L-${g.id}`, g.id, g.groupe, g.libelle, g.ordre));
  const ligneUnbord = {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue(lignesProjetParDefaut),
    update: jest.fn(),
  };
  const blocUnbord_ = {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue(opts.blocs ?? BLOCS_DEFAUT),
    findUnique: jest.fn().mockResolvedValue(opts.blocUnique ?? blocUnbord('documents', null)),
    update: jest.fn(),
  };
  const imageProjet = {
    createMany: jest.fn(),
    findMany: jest.fn().mockResolvedValue(opts.images ?? []),
  };
  const fichierProjet = {
    createMany: jest.fn(),
    findMany: jest.fn().mockResolvedValue(opts.fichiers ?? []),
  };
  const collaborateur = {
    findFirst: jest.fn().mockResolvedValue(opts.collaborateur ?? null),
    findUnique: jest.fn().mockResolvedValue(null),
  };
  const projet = { findFirst: jest.fn().mockResolvedValue(PROJET) };
  const prisma = {
    ligneUnbordGabarit,
    ligneUnbord,
    blocUnbord: blocUnbord_,
    imageProjet,
    fichierProjet,
    collaborateur,
    projet,
    // joindreImages/joindreFichiers postent le fichier ET marquent l'item
    // fait en une transaction (cf. marquerFait) — mock minimal.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  return {
    prisma,
    ligneUnbordGabarit,
    ligneUnbord,
    blocUnbord: blocUnbord_,
    imageProjet,
    fichierProjet,
    collaborateur,
    projet,
  };
}

function mockNotifications() {
  const pousser = jest.fn().mockResolvedValue(undefined);
  return { pousser } as unknown as NotificationsService;
}

const DTO_FICHIERS = { fichiers: [{ nom: 'titre-foncier.pdf', url: 'data:application/pdf;base64,AA==' }] };
const DTO_IMAGES = { fichiers: [{ nom: 'photo-terrain.jpg', url: 'data:image/jpeg;base64,AA==' }] };

describe('UnbordService.assurerLignes — amorçage depuis le gabarit de la société', () => {
  it('un gabarit actif → les lignes projet sont créées avec la bonne FK gabaritId', async () => {
    const { prisma, ligneUnbord } = mockPrisma();
    const svc = new UnbordService(prisma, mockNotifications());
    await svc.get('S1', 'P1');
    expect(ligneUnbord.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ projetId: 'P1', gabaritId: 'G-plan_cadastral', libelle: 'Plan cadastral' }),
        expect.objectContaining({ projetId: 'P1', gabaritId: 'G-ninea', libelle: 'Ninéa' }),
      ],
      skipDuplicates: true,
    });
  });

  it('gabarit vide → aucun createMany, pas d’erreur', async () => {
    const { prisma, ligneUnbord } = mockPrisma({ gabarit: [], lignesProjet: [] });
    const svc = new UnbordService(prisma, mockNotifications());
    await expect(svc.get('S1', 'P1')).resolves.toBeDefined();
    expect(ligneUnbord.createMany).not.toHaveBeenCalled();
  });
});

describe('UnbordService — accès par bloc (verifierAccesBloc)', () => {
  it('BLOC LIBRE : n’importe quel membre de l’équipe peut joindre un fichier (règle de septembre préservée)', async () => {
    const { prisma, fichierProjet } = mockPrisma({ blocUnique: blocUnbord('documents', null) });
    const svc = new UnbordService(prisma, mockNotifications());
    await svc.joindreFichiers('S1', 'P1', 'L-G-plan_cadastral', DTO_FICHIERS, 'U1', 'collaborateur');
    expect(fichierProjet.createMany).toHaveBeenCalled();
  });

  it('BLOC ASSIGNÉ : le responsable désigné peut agir', async () => {
    const { prisma, fichierProjet, collaborateur } = mockPrisma({
      blocUnique: blocUnbord('documents', 'C1'),
      collaborateur: { id: 'C1' },
    });
    const svc = new UnbordService(prisma, mockNotifications());
    await svc.joindreFichiers('S1', 'P1', 'L-G-plan_cadastral', DTO_FICHIERS, 'U1', 'collaborateur');
    expect(fichierProjet.createMany).toHaveBeenCalled();
    expect(collaborateur.findFirst).toHaveBeenCalled();
  });

  it('BLOC ASSIGNÉ : un collaborateur qui n’est PAS le responsable → 403, rien créé', async () => {
    const { prisma, fichierProjet } = mockPrisma({
      blocUnique: blocUnbord('documents', 'RESPONSABLE'),
      collaborateur: { id: 'AUTRE_COLLAB' },
    });
    const svc = new UnbordService(prisma, mockNotifications());
    await expect(
      svc.joindreFichiers('S1', 'P1', 'L-G-plan_cadastral', DTO_FICHIERS, 'U1', 'collaborateur'),
    ).rejects.toThrow(ForbiddenException);
    expect(fichierProjet.createMany).not.toHaveBeenCalled();
  });

  it('BLOC ASSIGNÉ : societe_admin agit sans être le responsable', async () => {
    const { prisma, fichierProjet, collaborateur } = mockPrisma({
      blocUnique: blocUnbord('documents', 'RESPONSABLE'),
    });
    const svc = new UnbordService(prisma, mockNotifications());
    await svc.joindreFichiers('S1', 'P1', 'L-G-plan_cadastral', DTO_FICHIERS, 'U1', 'societe_admin');
    expect(fichierProjet.createMany).toHaveBeenCalled();
    expect(collaborateur.findFirst).not.toHaveBeenCalled();
  });

  it('joindreImages et patchLigne suivent la même garde par bloc', async () => {
    const { prisma, imageProjet, ligneUnbord } = mockPrisma({
      blocUnique: blocUnbord('documents', 'RESPONSABLE'),
      collaborateur: { id: 'AUTRE_COLLAB' },
    });
    const svc = new UnbordService(prisma, mockNotifications());
    await expect(
      svc.joindreImages('S1', 'P1', 'L-G-plan_cadastral', DTO_IMAGES, 'U1', 'collaborateur'),
    ).rejects.toThrow(ForbiddenException);
    expect(imageProjet.createMany).not.toHaveBeenCalled();

    await expect(
      svc.patchLigne('S1', 'P1', 'L-G-plan_cadastral', { nonRequise: true }, 'U1', 'collaborateur'),
    ).rejects.toThrow(ForbiddenException);
    expect(ligneUnbord.update).not.toHaveBeenCalled();
  });

  it('ligne introuvable → 404, rien créé (avant même la vérification du bloc)', async () => {
    const { prisma, fichierProjet } = mockPrisma();
    const svc = new UnbordService(prisma, mockNotifications());
    await expect(
      svc.joindreFichiers('S1', 'P1', 'INEXISTANTE', DTO_FICHIERS, 'U1', 'collaborateur'),
    ).rejects.toThrow(NotFoundException);
    expect(fichierProjet.createMany).not.toHaveBeenCalled();
  });
});

describe('UnbordService.patchBloc — qui peut ASSIGNER (estAutoriseAAssigner, même règle que Permis)', () => {
  it('AUTORISÉ : auto-désignation sur un bloc LIBRE', async () => {
    const { prisma, blocUnbord: mockBloc } = mockPrisma({
      blocs: [blocUnbord('documents', null), blocUnbord('releve_existant', null)],
      collaborateur: { id: 'C1', celluleId: null },
    });
    const svc = new UnbordService(prisma, mockNotifications());
    await svc.patchBloc('S1', 'P1', 'documents' as never, { responsableId: 'C1' }, 'U1', 'collaborateur');
    expect(mockBloc.update).toHaveBeenCalledWith({
      where: { projetId_groupe: { projetId: 'P1', groupe: 'documents' } },
      data: { responsable: { connect: { id: 'C1' } } },
    });
  });

  it('REFUSÉ : un collaborateur (ni admin ni dispatcher) essaie d’assigner QUELQU’UN D’AUTRE sur un bloc libre', async () => {
    const { prisma, blocUnbord: mockBloc } = mockPrisma({
      blocs: [blocUnbord('documents', null), blocUnbord('releve_existant', null)],
      collaborateur: { id: 'C1', celluleId: null },
    });
    const svc = new UnbordService(prisma, mockNotifications());
    await expect(
      svc.patchBloc('S1', 'P1', 'documents' as never, { responsableId: 'AUTRE' }, 'U1', 'collaborateur'),
    ).rejects.toThrow(ForbiddenException);
    expect(mockBloc.update).not.toHaveBeenCalled();
  });

  it('bloc introuvable (groupe invalide) → 404', async () => {
    const { prisma } = mockPrisma({ blocs: [] });
    const svc = new UnbordService(prisma, mockNotifications());
    await expect(
      svc.patchBloc('S1', 'P1', 'documents' as never, { responsableId: 'C1' }, 'U1', 'societe_admin'),
    ).rejects.toThrow(NotFoundException);
  });

  it('societe_admin assigne librement, sans vérification de cellule', async () => {
    const { prisma, blocUnbord: mockBloc } = mockPrisma({
      blocs: [blocUnbord('documents', null), blocUnbord('releve_existant', null)],
    });
    const svc = new UnbordService(prisma, mockNotifications());
    await svc.patchBloc('S1', 'P1', 'documents' as never, { responsableId: 'QUELQUUN' }, 'U1', 'societe_admin');
    expect(mockBloc.update).toHaveBeenCalled();
  });

  it('nouvelle désignation → notification envoyée à la personne désignée', async () => {
    const notifications = mockNotifications();
    const { prisma } = mockPrisma({
      blocs: [blocUnbord('documents', null), blocUnbord('releve_existant', null)],
    });
    (prisma.collaborateur.findUnique as jest.Mock).mockResolvedValue({ utilisateurId: 'U2' });
    const svc = new UnbordService(prisma, notifications);
    await svc.patchBloc('S1', 'P1', 'documents' as never, { responsableId: 'C2' }, 'U1', 'societe_admin');
    expect(notifications.pousser).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'checklist_assignee', destinataireIds: ['U2'] }),
    );
  });

  it('ré-assignation à la MÊME personne → aucune notification', async () => {
    const notifications = mockNotifications();
    const { prisma } = mockPrisma({
      blocs: [blocUnbord('documents', 'C2'), blocUnbord('releve_existant', null)],
    });
    const svc = new UnbordService(prisma, notifications);
    await svc.patchBloc('S1', 'P1', 'documents' as never, { responsableId: 'C2' }, 'U1', 'societe_admin');
    expect(notifications.pousser).not.toHaveBeenCalled();
  });
});

describe('UnbordService.get — dérivation du statut (nonRequise a priorité sur les fichiers)', () => {
  it('aucun fichier, pas marqué non nécessaire → en_attente', async () => {
    const { prisma } = mockPrisma();
    const svc = new UnbordService(prisma, mockNotifications());
    const res = await svc.get('S1', 'P1');
    const item = res.groupes.flatMap((g) => g.items).find((i) => i.id === 'L-G-ninea');
    expect(item?.statut).toBe('en_attente');
  });

  it('coché manuellement (case à cocher, sept. 2026), pas marqué non nécessaire → fait', async () => {
    const { prisma } = mockPrisma({
      lignesProjet: [
        ligneProjet('L-G-plan_cadastral', 'G-plan_cadastral', 'documents', 'Plan cadastral', 0),
        ligneProjet('L-G-ninea', 'G-ninea', 'documents', 'Ninéa', 1, { fait: true }),
      ],
    });
    const svc = new UnbordService(prisma, mockNotifications());
    const res = await svc.get('S1', 'P1');
    const item = res.groupes.flatMap((g) => g.items).find((i) => i.id === 'L-G-ninea');
    expect(item?.statut).toBe('fait');
  });

  it('un fichier joint coche automatiquement l’item (fait=true posé par joindreFichiers/joindreImages)', async () => {
    const { prisma, ligneUnbord } = mockPrisma();
    const svc = new UnbordService(prisma, mockNotifications());
    await svc.joindreFichiers('S1', 'P1', 'L-G-plan_cadastral', DTO_FICHIERS, 'U1', 'collaborateur');
    expect(ligneUnbord.update).toHaveBeenCalledWith({
      where: { id: 'L-G-plan_cadastral' },
      data: { fait: true, nonRequise: false },
    });
  });

  it('marqué non nécessaire ALORS QUE coché manuellement → non_necessaire prime (pas « fait »)', async () => {
    const { prisma } = mockPrisma({
      lignesProjet: [
        ligneProjet('L-G-plan_cadastral', 'G-plan_cadastral', 'documents', 'Plan cadastral', 0),
        ligneProjet('L-G-ninea', 'G-ninea', 'documents', 'Ninéa', 1, { fait: true, nonRequise: true }),
      ],
    });
    const svc = new UnbordService(prisma, mockNotifications());
    const res = await svc.get('S1', 'P1');
    const item = res.groupes.flatMap((g) => g.items).find((i) => i.id === 'L-G-ninea');
    expect(item?.statut).toBe('non_necessaire');
  });

  it('patchLigne({ nonRequise: true }) force fait à false (mutuellement exclusifs)', async () => {
    const { prisma, ligneUnbord } = mockPrisma();
    const svc = new UnbordService(prisma, mockNotifications());
    await svc.patchLigne('S1', 'P1', 'L-G-plan_cadastral', { nonRequise: true }, 'U1', 'societe_admin');
    expect(ligneUnbord.update).toHaveBeenCalledWith({
      where: { id: 'L-G-plan_cadastral' },
      data: { nonRequise: true, fait: false },
    });
  });

  it('expose le responsable de chaque bloc (null si libre)', async () => {
    const { prisma } = mockPrisma({
      blocs: [blocUnbord('documents', 'C1'), blocUnbord('releve_existant', null)],
    });
    const svc = new UnbordService(prisma, mockNotifications());
    const res = await svc.get('S1', 'P1');
    expect(res.groupes.find((g) => g.groupe === 'documents')?.responsable).toEqual({
      id: 'C1',
      prenom: 'R',
      nom: 'X',
    });
    expect(res.groupes.find((g) => g.groupe === 'releve_existant')?.responsable).toBeNull();
  });
});
