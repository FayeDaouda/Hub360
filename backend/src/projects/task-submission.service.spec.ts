import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { ReviewCircuitService } from './review-circuit.service';
import { TaskSubmissionService } from './task-submission.service';

// Remise d'une tâche : fichiers et commentaire facultatifs, rattachés à la
// version remise ; le valideur voit « sans fichier joint » sinon.
describe('TaskSubmissionService.submit — fichiers', () => {
  function svc(fichierObligatoire = false) {
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
          id: 'T1',
          libelle: 'Plan masse',
          statut: 'reprise',
          version: 1,
          temps: { type: 'fixe' },
          assigneId: 'C1',
          fichierObligatoire,
          carte: { desactivation: null, ouvreApres: [], etapeNumero: 2 },
          projet: { code: 'GC-01', cellules: [{ cellule: { dispatcherId: 'C2' } }] },
        }),
      },
      collaborateur: {
        findFirst: jest.fn().mockResolvedValue({ id: 'C1' }),
        findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U2', dossierPersonnel: null }]),
      },
      // Contexte du jour (suppléance) : aucun Dir. GC, aucune absence.
      utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([]) },
      demandeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((f: (t: typeof tx) => Promise<unknown>) => f(tx)),
    } as unknown as PrismaService;
    const notifications = { pousser: jest.fn() } as unknown as NotificationsService;
    const reglages = {} as ReglagesService;
    const circuit = new ReviewCircuitService(prisma, notifications, reglages);
    return { s: new TaskSubmissionService(prisma, reglages, circuit), evenement, pieces };
  }
  const acteur = { userId: 'U1', role: 'Salarié' };

  it('fichiers rattachés à la nouvelle version, commentaire dans l’historique', async () => {
    const { s, evenement, pieces } = svc();
    await s.submit('S1', acteur, 'P1', 'T1', {
      pieces: [{ nom: 'plan.pdf', url: 'data:application/pdf;base64,AA' }],
      commentaire: ' corrigé ',
    });
    // Renommé selon la règle du HUB (CODE_ÉTAPE_TÂCHE_vNN).
    expect(pieces).toHaveBeenCalledWith({
      data: [expect.objectContaining({ tacheId: 'T1', version: 2, nom: 'GC-01_02_PLAN-MASSE_v02.pdf' })],
    });
    expect(evenement.mock.calls[0][0].data.detail).toBe('Remise v02 · 1 fichier · « corrigé »');
  });

  it('sans fichier : remise acceptée, signalée dans l’historique', async () => {
    const { s, evenement, pieces } = svc();
    await s.submit('S1', acteur, 'P1', 'T1');
    expect(pieces).not.toHaveBeenCalled();
    expect(evenement.mock.calls[0][0].data.detail).toBe('Remise v02 · sans fichier joint');
  });

  it('refuse un fichier qui n’est pas un data URI', async () => {
    await expect(
      svc().s.submit('S1', acteur, 'P1', 'T1', { pieces: [{ nom: 'x', url: 'http://ailleurs' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('fichier obligatoire (case du gabarit) : dépôt sans fichier refusé', async () => {
    const { s, pieces } = svc(true);
    await expect(s.submit('S1', acteur, 'P1', 'T1')).rejects.toThrow('Joignez au moins un fichier');
    expect(pieces).not.toHaveBeenCalled();
  });
});

// Dépôt à la place de l'assigné (décision du 09/11/2026) : l'Écriture de
// « Projets et cartes » (Dir. GC) ou le chef de l'équipe de l'assigné.
describe('TaskSubmissionService.submit — à la place de l’assigné', () => {
  function svc(opts: {
    moi: string | null;
    assigne: { id: string; celluleId: string } | null;
    chefDe?: string[];
    temps?: 'sans' | 'fixe';
  }) {
    const evenement = jest.fn();
    const pousser = jest.fn();
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      tacheProjet: { updateMany },
      evenementTacheProjet: { create: evenement },
      pieceRemiseTache: { createMany: jest.fn() },
    };
    const projetCellule = {
      findMany: jest.fn().mockResolvedValue((opts.chefDe ?? []).map((celluleId) => ({ celluleId }))),
    };
    const prisma = {
      tacheProjet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'T1',
          libelle: 'Eau',
          statut: 'a_faire',
          version: 0,
          temps: { type: opts.temps ?? 'sans' },
          assigneId: opts.assigne?.id ?? null,
          assigne: opts.assigne
            ? { prenom: 'Awa', nom: 'Diop', celluleId: opts.assigne.celluleId, utilisateurId: 'U-AWA' }
            : null,
          fichierObligatoire: false,
          carte: { desactivation: null, ouvreApres: [], etapeNumero: 1, taches: [] },
          projet: { code: 'GC-01', cellules: [{ cellule: { dispatcherId: 'C-CHEF' } }] },
        }),
      },
      collaborateur: {
        findFirst: jest.fn().mockResolvedValue(opts.moi ? { id: opts.moi } : null),
        // Fiche du Dir. GC (C9, son travail va au CTO) ; comptes : le chef
        // (direct) et l'assignée C1, reliée par son dossier RH.
        findMany: jest.fn(({ where }: { where: { id?: { in: string[] } } }) =>
          Promise.resolve(
            where.id
              ? where.id.in.map((id) =>
                  id === 'C1'
                    ? { utilisateurId: null, dossierPersonnel: { utilisateurId: 'U-AWA' } }
                    : { utilisateurId: 'U-CHEF', dossierPersonnel: null },
                )
              : [{ id: 'C9' }],
          ),
        ),
      },
      // Contexte du jour : U9 est Dir. GC, U-CTO est CTO, aucune absence.
      utilisateurSocieteRole: {
        findMany: jest.fn(({ where }: { where: { role: { nom: string } } }) =>
          Promise.resolve([{ utilisateurId: where.role.nom === 'CTO' ? 'U-CTO' : 'U9' }]),
        ),
      },
      demandeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
      projetCellule,
      $transaction: jest.fn((f: (t: typeof tx) => Promise<unknown>) => f(tx)),
    } as unknown as PrismaService;
    const notifications = { pousser } as unknown as NotificationsService;
    const reglages = {} as ReglagesService;
    const circuit = new ReviewCircuitService(prisma, notifications, reglages);
    return { s: new TaskSubmissionService(prisma, reglages, circuit), evenement, pousser, projetCellule, updateMany };
  }
  const salarie = { userId: 'U1', role: 'Salarié', permissions: { projets: 'L' } };
  const dirGc = { userId: 'U9', role: 'Dir. GC', permissions: { projets: 'LE' } };

  it('le Dir. GC coche une tâche sans assigné : validée, tracée à son nom', async () => {
    const { s, evenement, pousser } = svc({ moi: 'C9', assigne: null });
    await expect(s.submit('S1', dirGc, 'P1', 'T1')).resolves.toEqual({ statut: 'validee', version: 1 });
    expect(evenement.mock.calls[0][0].data).toMatchObject({ parId: 'U9', detail: 'Remise v01 · sans fichier joint' });
    expect(pousser).not.toHaveBeenCalled();
  });

  it('le Dir. GC coche la tâche d’un autre : « à la place de », l’assigné est prévenu', async () => {
    const { s, evenement, pousser } = svc({ moi: 'C9', assigne: { id: 'C1', celluleId: 'EQ1' } });
    await s.submit('S1', dirGc, 'P1', 'T1');
    expect(evenement.mock.calls[0][0].data.detail).toBe('Remise v01 · sans fichier joint · à la place de Awa Diop');
    expect(pousser).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tache_validee', parId: 'U9', destinataireIds: ['U-AWA'] }),
    );
  });

  it('le chef d’équipe coche la tâche d’un membre de son équipe', async () => {
    const { s } = svc({ moi: 'C-CHEF', assigne: { id: 'C1', celluleId: 'EQ1' }, chefDe: ['EQ1'] });
    await expect(s.submit('S1', salarie, 'P1', 'T1')).resolves.toEqual({ statut: 'validee', version: 1 });
  });

  it('le chef d’une autre équipe est refusé', async () => {
    const { s } = svc({ moi: 'C-CHEF', assigne: { id: 'C1', celluleId: 'EQ1' }, chefDe: ['EQ2'] });
    await expect(s.submit('S1', salarie, 'P1', 'T1')).rejects.toThrow(ForbiddenException);
  });

  it('un simple membre ne coche pas la tâche d’un autre', async () => {
    const { s } = svc({ moi: 'C3', assigne: { id: 'C1', celluleId: 'EQ1' } });
    await expect(s.submit('S1', salarie, 'P1', 'T1')).rejects.toThrow(ForbiddenException);
  });

  it('l’assigné : pas de lecture des équipes, personne d’autre prévenu', async () => {
    const { s, pousser, projetCellule } = svc({ moi: 'C1', assigne: { id: 'C1', celluleId: 'EQ1' } });
    await s.submit('S1', salarie, 'P1', 'T1');
    expect(projetCellule.findMany).not.toHaveBeenCalled();
    expect(pousser).not.toHaveBeenCalled();
  });
  // Tâche avec temps atelier : la remise attend une validation, sur le
  // circuit de l'assigné (et non de qui dépose à sa place).
  it('le chef d’équipe remet à la place d’un membre une tâche à valider : statut « à valider », l’assigné est prévenu', async () => {
    const { s, updateMany, pousser } = svc({
      moi: 'C-CHEF',
      assigne: { id: 'C1', celluleId: 'EQ1' },
      chefDe: ['EQ1'],
      temps: 'fixe',
    });
    const chef = { userId: 'U-CHEF', role: 'Salarié', permissions: { projets: 'L' } };
    await expect(s.submit('S1', chef, 'P1', 'T1')).resolves.toEqual({ statut: 'a_valider', version: 1 });
    expect(updateMany.mock.calls[0][0].data).toEqual({ statut: 'a_valider', version: 1 });
    // Circuit de l'assigné C1 : le chef lui-même (pas de notification à soi).
    // Celui du chef (sa propre tâche) aurait prévenu le Dir. GC U9.
    expect(pousser).toHaveBeenCalledTimes(1);
    expect(pousser).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tache_assignee',
        parId: 'U-CHEF',
        destinataireIds: ['U-AWA'],
        titre: 'Remise v01 déposée à votre place · GC-01 · Eau',
      }),
    );
  });

  it('le Dir. GC remet une tâche à valider à la place d’un membre : le chef de l’assigné valide, pas le CTO', async () => {
    const { s, pousser } = svc({ moi: 'C9', assigne: { id: 'C1', celluleId: 'EQ1' }, temps: 'fixe' });
    await expect(s.submit('S1', dirGc, 'P1', 'T1')).resolves.toEqual({ statut: 'a_valider', version: 1 });
    const notifications = pousser.mock.calls.map((c: unknown[]) => c[0]);
    expect(notifications).toEqual([
      expect.objectContaining({
        type: 'tache_remise',
        titre: 'Remise v01 à valider · GC-01 · Eau',
        destinataireIds: ['U-CHEF'],
      }),
      expect.objectContaining({ type: 'tache_assignee', destinataireIds: ['U-AWA'] }),
    ]);
  });

  it('sans fiche d’équipe, l’Écriture de « Projets et cartes » suffit pour remettre la tâche d’un autre', async () => {
    const { s, evenement, pousser, projetCellule } = svc({
      moi: null,
      assigne: { id: 'C1', celluleId: 'EQ1' },
      temps: 'fixe',
    });
    await expect(s.submit('S1', dirGc, 'P1', 'T1')).resolves.toEqual({ statut: 'a_valider', version: 1 });
    expect(projetCellule.findMany).not.toHaveBeenCalled();
    expect(evenement.mock.calls[0][0].data.detail).toBe('Remise v01 · sans fichier joint · à la place de Awa Diop');
    expect(pousser).toHaveBeenCalledWith(expect.objectContaining({ destinataireIds: ['U-AWA'] }));
  });

  it('sans fiche d’équipe ni droit d’écriture, la remise est refusée', async () => {
    const { s, updateMany } = svc({ moi: null, assigne: null });
    await expect(s.submit('S1', salarie, 'P1', 'T1')).rejects.toThrow(ForbiddenException);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// Garde-fous du dépôt (relecture sécurité, 09/11/2026).
describe('TaskSubmissionService.submit — périmètre et Mon espace', () => {
  function svc(assigneId: string | null) {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'T1',
      libelle: 'Eau',
      statut: 'a_faire',
      version: 0,
      temps: { type: 'sans' },
      assigneId,
      assigne: assigneId ? { prenom: 'Awa', nom: 'Diop', celluleId: 'EQ1' } : null,
      fichierObligatoire: false,
      carte: { desactivation: null, ouvreApres: [], etapeNumero: 1, taches: [] },
      projet: { code: 'GC-01', cellules: [] },
    });
    const tx = {
      tacheProjet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      evenementTacheProjet: { create: jest.fn() },
      pieceRemiseTache: { createMany: jest.fn() },
    };
    const prisma = {
      tacheProjet: { findFirst },
      collaborateur: {
        findFirst: jest.fn().mockResolvedValue({ id: 'C-CHEF' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      projetCellule: { findMany: jest.fn().mockResolvedValue([{ celluleId: 'EQ1' }]) },
      $transaction: jest.fn((f: (t: typeof tx) => Promise<unknown>) => f(tx)),
    } as unknown as PrismaService;
    const notifications = { pousser: jest.fn() } as unknown as NotificationsService;
    const reglages = {} as ReglagesService;
    const circuit = new ReviewCircuitService(prisma, notifications, reglages);
    return { s: new TaskSubmissionService(prisma, reglages, circuit), findFirst, tx };
  }
  const chef = { userId: 'U-CHEF', role: 'Salarié', permissions: { projets: 'L' } };

  it('un Salarié ne dépose que sur un projet de son périmètre (projectScope dans la requête)', async () => {
    const { s, findFirst } = svc(null);
    await s.submit('S1', chef, 'P1', 'T1');
    expect(findFirst.mock.calls[0][0].where.projet).toMatchObject({ societeId: 'S1', OR: expect.any(Array) });
  });

  it('Mon espace : le chef d’équipe ne dépose pas à la place d’un membre', async () => {
    const { s, tx } = svc('C1');
    await expect(s.submit('S1', chef, 'P1', 'T1', {}, true)).rejects.toThrow(ForbiddenException);
    expect(tx.tacheProjet.updateMany).not.toHaveBeenCalled();
  });

  it('hors Mon espace, le même chef d’équipe dépose à la place de son membre', async () => {
    const { s } = svc('C1');
    await expect(s.submit('S1', chef, 'P1', 'T1')).resolves.toEqual({ statut: 'validee', version: 1 });
  });
});
