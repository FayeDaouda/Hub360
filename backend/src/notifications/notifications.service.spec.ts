import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationsBus } from '../realtime/notifications.bus';

// notifierDossierCrm : résolution des comptes (DAF = titulaires CFO actifs,
// propriétaire sinon titulaires Dir. GC, apporteur interne seulement) et
// best-effort (ne lève jamais).

type Dossier = {
  code: string;
  programme: string;
  proprietaireId: string | null;
  apporteurType: 'interne' | 'externe' | null;
  apporteurUtilisateurId: string | null;
  creeParId?: string | null;
  creePar?: { prenom: string; nom: string } | null;
  statut?: string;
};

const DOSSIER: Dossier = {
  code: 'TCP_ALM.26',
  programme: 'Villa Almadies',
  proprietaireId: 'DG1',
  apporteurType: 'interne',
  apporteurUtilisateurId: 'AP1',
};

function svc(opts: { dossier?: Dossier | null; titulaires?: Record<string, string[]>; echec?: boolean } = {}) {
  const createMany = opts.echec
    ? jest.fn().mockRejectedValue(new Error('base indisponible'))
    : jest.fn().mockResolvedValue({ count: 1 });
  const usrFindMany = jest.fn(({ where }: { where: { role: { nom: string } } }) =>
    Promise.resolve((opts.titulaires?.[where.role.nom] ?? []).map((utilisateurId) => ({ utilisateurId }))),
  );
  const prisma = {
    dossierCrm: { findFirst: jest.fn().mockResolvedValue(opts.dossier === undefined ? DOSSIER : opts.dossier) },
    utilisateurSocieteRole: { findMany: usrFindMany },
    notification: { createMany },
  } as unknown as PrismaService;
  return { s: new NotificationsService(prisma, new NotificationsBus()), createMany, usrFindMany };
}

const lignes = (m: jest.Mock) =>
  (m.mock.calls[0]?.[0].data ?? []).map((d: { destinataireId: string }) => d.destinataireId);

describe('NotificationsService.notifierDossierCrm', () => {
  it('soumission → titulaires CFO actifs de la société, lien vers le dossier', async () => {
    const { s, createMany, usrFindMany } = svc({ titulaires: { CFO: ['CFO1'] } });
    await s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'dossier_soumis', parId: 'DG1' });
    expect(usrFindMany.mock.calls[0][0].where).toEqual({
      societeId: 'S1',
      role: { nom: 'CFO', supprimeLe: null, OR: [{ societeId: 'S1' }, { societeId: null }] },
      utilisateur: { actif: true },
    });
    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        destinataireId: 'CFO1',
        societeId: 'S1',
        type: 'dossier_soumis',
        dossierCrmId: 'D1',
        projetId: null,
        parId: 'DG1',
      }),
    ]);
  });

  it('propriétaire « à assigner » → tous les titulaires Dir. GC', async () => {
    const { s, createMany } = svc({
      dossier: { ...DOSSIER, proprietaireId: null },
      titulaires: { 'Dir. GC': ['DG1', 'DG2'] },
    });
    await s.notifierDossierCrm({
      societeId: 'S1',
      dossierId: 'D1',
      evenement: 'dossier_renvoye',
      parId: 'CFO1',
      commentaire: 'x',
    });
    expect(lignes(createMany)).toEqual(['DG1', 'DG2']);
  });

  it('dossier créé par le COO → le Dir. GC, titre au nom officiel du créateur', async () => {
    const { s, createMany } = svc({
      dossier: { ...DOSSIER, programme: '', creeParId: 'COO1', creePar: { prenom: 'Awa', nom: 'Diop' } },
      titulaires: { CFO: ['CFO1'] },
    });
    await s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'dossier_cree', parId: 'COO1' });
    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        destinataireId: 'DG1',
        type: 'dossier_cree',
        dossierCrmId: 'D1',
        titre: 'TCP_ALM.26 — nouveau projet créé par Awa Diop, à prendre en charge',
        parId: 'COO1',
      }),
    ]);
  });

  it('dossier créé « à assigner » par un Dir. GC → les autres titulaires Dir. GC seuls', async () => {
    const { s, createMany } = svc({
      dossier: { ...DOSSIER, proprietaireId: null, creeParId: 'DG1', creePar: { prenom: 'Moussa', nom: 'Fall' } },
      titulaires: { 'Dir. GC': ['DG1', 'DG2'], CFO: ['CFO1'] },
    });
    await s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'dossier_cree', parId: 'DG1' });
    expect(lignes(createMany)).toEqual(['DG2']);
  });

  it('dossier créé, créateur introuvable (compte supprimé) → titre sans nom', async () => {
    const { s, createMany } = svc({ dossier: { ...DOSSIER, creeParId: null, creePar: null } });
    await s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'dossier_cree', parId: 'COO1' });
    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        destinataireId: 'DG1',
        titre: 'TCP_ALM.26 — nouveau projet créé, à prendre en charge',
      }),
    ]);
  });

  it('apporteur externe (pas de compte) → seul le propriétaire', async () => {
    const { s, createMany } = svc({
      dossier: { ...DOSSIER, apporteurType: 'externe', apporteurUtilisateurId: null },
    });
    await s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'offre_refusee', parId: null });
    expect(lignes(createMany)).toEqual(['DG1']);
  });

  it('contrat signé → propriétaire + DAF, avec le projet créé', async () => {
    const { s, createMany } = svc({ titulaires: { CFO: ['CFO1'] } });
    await s.notifierDossierCrm({
      societeId: 'S1',
      dossierId: 'D1',
      evenement: 'contrat_signe',
      parId: null,
      projetId: 'P1',
      facturesPreparees: 6,
    });
    expect(lignes(createMany)).toEqual(['DG1', 'CFO1']);
    expect(createMany.mock.calls[0][0].data[1]).toMatchObject({ projetId: 'P1', dossierCrmId: 'D1' });
  });

  it('personne à prévenir → aucune écriture', async () => {
    const { s, createMany } = svc();
    await s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'dossier_soumis', parId: null });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('dossier d’une autre société → rien', async () => {
    const { s, createMany } = svc({ dossier: null, titulaires: { CFO: ['CFO1'] } });
    await s.notifierDossierCrm({ societeId: 'S2', dossierId: 'D1', evenement: 'dossier_soumis', parId: null });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('échec d’écriture → ne lève pas (la validation / signature a déjà eu lieu)', async () => {
    const { s } = svc({ titulaires: { CFO: ['CFO1'] }, echec: true });
    await expect(
      s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'dossier_soumis', parId: null }),
    ).resolves.toBeUndefined();
  });
});

// Fiche figée modifiée (09/11/2026) : titre au nom officiel de l'AUTEUR de la
// modification ; propriétaire + créateur (+ CFO en validation), jamais
// l'auteur ; une notification non lue existante est remise à jour au lieu
// d'en empiler une nouvelle.
describe('NotificationsService.notifierDossierCrm · dossier_modifie', () => {
  const MAINTENANT = new Date('2026-11-09T10:00:00Z');
  const MODIFIE: Dossier = {
    ...DOSSIER,
    statut: 'en_validation',
    creeParId: 'COO1',
    creePar: { prenom: 'Awa', nom: 'Diop' },
  };

  function svcModif(
    opts: {
      dossier?: Dossier;
      titulaires?: Record<string, string[]>;
      auteur?: { prenom: string; nom: string } | null;
      nonLues?: { id: string; destinataireId: string }[];
    } = {},
  ) {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    // Remise à jour conditionnelle (toujours non lue) : updateMany → { count }.
    const update = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue(opts.nonLues ?? []);
    const findUnique = jest
      .fn()
      .mockResolvedValue(opts.auteur === undefined ? { prenom: 'Moussa', nom: 'Fall' } : opts.auteur);
    const prisma = {
      dossierCrm: { findFirst: jest.fn().mockResolvedValue(opts.dossier ?? MODIFIE) },
      utilisateurSocieteRole: {
        findMany: jest.fn(({ where }: { where: { role: { nom: string } } }) =>
          Promise.resolve((opts.titulaires?.[where.role.nom] ?? []).map((utilisateurId) => ({ utilisateurId }))),
        ),
      },
      utilisateur: { findUnique },
      notification: { createMany, updateMany: update, create, findMany },
    } as unknown as PrismaService;
    return {
      s: new NotificationsService(prisma, new NotificationsBus()),
      createMany,
      update,
      create,
      findMany,
      findUnique,
    };
  }

  const TITRE =
    'TCP_ALM.26 · Villa Almadies — fiche modifiée par Moussa Fall après soumission (détail dans l’historique)';
  const modif = (parId: string | null = 'U9') => ({
    societeId: 'S1',
    dossierId: 'D1',
    evenement: 'dossier_modifie' as const,
    parId,
  });

  beforeEach(() => jest.useFakeTimers({ now: MAINTENANT, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  it('en validation : propriétaire, créateur et CFO, titre au nom officiel de l’auteur (pas du créateur)', async () => {
    const { s, createMany, findUnique } = svcModif({ titulaires: { CFO: ['CFO1'] } });
    await s.notifierDossierCrm(modif());
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'U9' }, select: { prenom: true, nom: true } });
    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ destinataireId: 'DG1', type: 'dossier_modifie', dossierCrmId: 'D1', titre: TITRE }),
      expect.objectContaining({ destinataireId: 'COO1', titre: TITRE, parId: 'U9' }),
      expect.objectContaining({ destinataireId: 'CFO1', titre: TITRE }),
    ]);
  });

  it('offre envoyée : le CFO n’est plus prévenu', async () => {
    const { s, createMany } = svcModif({
      dossier: { ...MODIFIE, statut: 'offre_envoyee' },
      titulaires: { CFO: ['CFO1'] },
    });
    await s.notifierDossierCrm(modif());
    expect(lignes(createMany)).toEqual(['DG1', 'COO1']);
  });

  it('l’auteur n’est jamais notifié (ici le créateur lui-même)', async () => {
    const { s, createMany } = svcModif({ titulaires: { CFO: ['CFO1'] } });
    await s.notifierDossierCrm(modif('COO1'));
    expect(lignes(createMany)).toEqual(['DG1', 'CFO1']);
  });

  it('apporteur interne : pas prévenu d’une fiche modifiée', async () => {
    const { s, createMany } = svcModif();
    await s.notifierDossierCrm(modif());
    expect(lignes(createMany)).not.toContain('AP1');
  });

  it('auteur introuvable → titre sans nom', async () => {
    const { s, createMany } = svcModif({ auteur: null });
    await s.notifierDossierCrm(modif());
    expect(createMany.mock.calls[0][0].data[0].titre).toBe(
      'TCP_ALM.26 · Villa Almadies — fiche modifiée après soumission (détail dans l’historique)',
    );
  });

  it('notification non lue déjà là → mise à jour (titre, auteur, date), seule l’autre est créée', async () => {
    const { s, createMany, update, findMany } = svcModif({ nonLues: [{ id: 'N1', destinataireId: 'DG1' }] });
    await s.notifierDossierCrm(modif());
    expect(findMany.mock.calls[0][0].where).toEqual({
      societeId: 'S1',
      type: 'dossier_modifie',
      dossierCrmId: 'D1',
      luLe: null,
      destinataireId: { in: ['DG1', 'COO1'] },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'N1', luLe: null },
      data: { titre: TITRE, parId: 'U9', createdAt: MAINTENANT },
    });
    expect(lignes(createMany)).toEqual(['COO1']);
  });

  it('non lue lue entre la lecture et la mise à jour → une nouvelle notification est créée', async () => {
    const { s, update, create } = svcModif({ nonLues: [{ id: 'N1', destinataireId: 'DG1' }] });
    update.mockResolvedValue({ count: 0 });
    await s.notifierDossierCrm(modif());
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        destinataireId: 'DG1',
        type: 'dossier_modifie',
        dossierCrmId: 'D1',
        titre: TITRE,
      }),
    });
  });

  it('tous les destinataires ont déjà une non lue → que des mises à jour, aucune création', async () => {
    const { s, createMany, update } = svcModif({
      nonLues: [
        { id: 'N1', destinataireId: 'DG1' },
        { id: 'N2', destinataireId: 'COO1' },
      ],
    });
    await s.notifierDossierCrm(modif());
    expect(update.mock.calls.map((c) => c[0].where.id)).toEqual(['N1', 'N2']);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('autre événement (soumission) : pas de recherche de non lues ni de mise à jour', async () => {
    const { s, createMany, update, findMany, findUnique } = svcModif({ titulaires: { CFO: ['CFO1'] } });
    await s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'dossier_soumis', parId: 'DG1' });
    expect(findMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(lignes(createMany)).toEqual(['CFO1']);
  });

  it('échec de la mise à jour → ne lève pas (la fiche est déjà enregistrée)', async () => {
    const { s, update } = svcModif({ nonLues: [{ id: 'N1', destinataireId: 'DG1' }] });
    update.mockRejectedValue(new Error('base indisponible'));
    await expect(s.notifierDossierCrm(modif())).resolves.toBeUndefined();
  });
});

// Temps réel (09/11/2026) : chaque écriture de notifications est suivie d'un
// signal aux destinataires (leur cloche se relit) ; rien si personne n'est
// notifié, rien si l'écriture échoue (l'écran ne relirait que l'ancien état).
describe('NotificationsService · signal temps réel', () => {
  const PROJET = { id: 'P1', code: 'GC-P1', celluleIds: [] };

  function monter(o: { titulaires?: Record<string, string[]>; echec?: boolean } = {}) {
    const createMany = o.echec
      ? jest.fn().mockRejectedValue(new Error('base indisponible'))
      : jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      dossierCrm: { findFirst: jest.fn().mockResolvedValue(DOSSIER), findMany: jest.fn().mockResolvedValue([]) },
      utilisateurSocieteRole: {
        findMany: jest.fn(({ where }: { where: { role: { nom: string } } }) =>
          Promise.resolve((o.titulaires?.[where.role.nom] ?? []).map((utilisateurId) => ({ utilisateurId }))),
        ),
      },
      utilisateur: { findUnique: jest.fn().mockResolvedValue({ prenom: 'Moussa', nom: 'Fall' }) },
      notification: {
        createMany,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    const bus = new NotificationsBus();
    const signaux: { societeId: string; destinataireIds: string[] }[] = [];
    bus.all().subscribe((x) => signaux.push(x));
    return { s: new NotificationsService(prisma, bus), prisma, createMany, signaux };
  }

  describe('pousser', () => {
    it('signale les destinataires une fois les notifications écrites', async () => {
      const { s, createMany, signaux } = monter();
      let ecrire!: (v: unknown) => void;
      createMany.mockReturnValue(new Promise((r) => (ecrire = r)));
      const envoi = s.pousser({
        societeId: 'S1',
        projet: PROJET,
        type: 'tache_assignee',
        titre: 'Tâche assignée',
        destinataireIds: ['U1', 'U2'],
      });
      await Promise.resolve();
      expect(signaux).toEqual([]); // écriture pas encore validée
      ecrire({ count: 2 });
      await envoi;
      expect(signaux).toEqual([{ societeId: 'S1', destinataireIds: ['U1', 'U2'], kind: 'new' }]);
    });

    it('aucun destinataire : ni écriture ni signal', async () => {
      const { s, createMany, signaux } = monter();
      await s.pousser({ societeId: 'S1', projet: PROJET, type: 'tache_assignee', titre: 'x', destinataireIds: [] });
      expect(createMany).not.toHaveBeenCalled();
      expect(signaux).toEqual([]);
    });

    it('écriture en échec : l’erreur remonte à l’appelant, aucun signal', async () => {
      const { s, signaux } = monter({ echec: true });
      await expect(
        s.pousser({ societeId: 'S1', projet: PROJET, type: 'tache_assignee', titre: 'x', destinataireIds: ['U1'] }),
      ).rejects.toThrow('base indisponible');
      expect(signaux).toEqual([]);
    });
  });

  describe('envoyer', () => {
    const base = { societeId: 'S1', type: 'annonce_importante' as const, titre: 'Annonce' };

    it('signale les destinataires dédoublonnés, jamais l’auteur', async () => {
      const { s, signaux } = monter();
      await s.envoyer({ ...base, destinataireIds: ['U1', 'AUTEUR', 'U1', null, 'U2'], parId: 'AUTEUR' });
      expect(signaux).toEqual([{ societeId: 'S1', destinataireIds: ['U1', 'U2'], kind: 'new' }]);
    });

    it('personne à prévenir (seul l’auteur, ou vide) : aucun signal', async () => {
      const { s, createMany, signaux } = monter();
      await expect(s.envoyer({ ...base, destinataireIds: ['AUTEUR', undefined], parId: 'AUTEUR' })).resolves.toBe(0);
      await expect(s.envoyer({ ...base, destinataireIds: [] })).resolves.toBe(0);
      expect(createMany).not.toHaveBeenCalled();
      expect(signaux).toEqual([]);
    });

    it('écriture en échec : ne lève pas, renvoie 0, aucun signal', async () => {
      const { s, signaux } = monter({ echec: true });
      await expect(s.envoyer({ ...base, destinataireIds: ['U1'] })).resolves.toBe(0);
      expect(signaux).toEqual([]);
    });
  });

  describe('notifierFactureAValider', () => {
    const params = { societeId: 'S1', factureId: 'F1', dossierCrmId: 'D1', titre: 'Facture à valider' };

    it('signale les titulaires CFO de la société', async () => {
      const { s, signaux } = monter({ titulaires: { CFO: ['CFO1', 'CFO2'] } });
      await s.notifierFactureAValider(params);
      expect(signaux).toEqual([{ societeId: 'S1', destinataireIds: ['CFO1', 'CFO2'], kind: 'new' }]);
    });

    it('aucun CFO : aucun signal', async () => {
      const { s, createMany, signaux } = monter();
      await s.notifierFactureAValider(params);
      expect(createMany).not.toHaveBeenCalled();
      expect(signaux).toEqual([]);
    });

    it('écriture en échec : ne lève pas, aucun signal', async () => {
      const { s, signaux } = monter({ titulaires: { CFO: ['CFO1'] }, echec: true });
      await expect(s.notifierFactureAValider(params)).resolves.toBeUndefined();
      expect(signaux).toEqual([]);
    });
  });

  describe('notifierDossierCrm', () => {
    it('création : signal aux destinataires du plan', async () => {
      const { s, signaux } = monter({ titulaires: { CFO: ['CFO1'] } });
      await s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'contrat_signe', parId: null });
      expect(signaux).toEqual([{ societeId: 'S1', destinataireIds: ['DG1', 'CFO1'], kind: 'new' }]);
    });

    it('fiche modifiée : signal aussi à ceux dont la notification non lue est remise à jour', async () => {
      const { s, prisma, createMany, signaux } = monter();
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([{ id: 'N1', destinataireId: 'DG1' }]);
      await s.notifierDossierCrm({
        societeId: 'S1',
        dossierId: 'D1',
        evenement: 'dossier_modifie',
        parId: 'U9',
      });
      // DG1 : remise à jour (pas de création) ; il est quand même signalé.
      expect(createMany).not.toHaveBeenCalled();
      // Remise à jour = « nouvelle » (elle redevient récente dans la cloche).
      expect(signaux).toEqual([{ societeId: 'S1', destinataireIds: ['DG1'], kind: 'new' }]);
    });

    it('fiche modifiée : créations et mises à jour réunies dans un seul signal', async () => {
      const { s, prisma, signaux } = monter();
      (prisma.dossierCrm.findFirst as jest.Mock).mockResolvedValue({
        ...DOSSIER,
        statut: 'offre_envoyee',
        creeParId: 'COO1',
        creePar: { prenom: 'Awa', nom: 'Diop' },
      });
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([{ id: 'N1', destinataireId: 'DG1' }]);
      await s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'dossier_modifie', parId: 'U9' });
      expect(signaux).toHaveLength(1);
      expect([...signaux[0].destinataireIds].sort()).toEqual(['COO1', 'DG1']);
    });

    it('personne à prévenir : aucun signal', async () => {
      const { s, signaux } = monter();
      await s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'dossier_soumis', parId: null });
      expect(signaux).toEqual([]);
    });

    it('écriture en échec : ne lève pas, aucun signal', async () => {
      const { s, signaux } = monter({ titulaires: { CFO: ['CFO1'] }, echec: true });
      await s.notifierDossierCrm({ societeId: 'S1', dossierId: 'D1', evenement: 'dossier_soumis', parId: null });
      expect(signaux).toEqual([]);
    });
  });

  describe('marquerLues', () => {
    it('se signale à soi-même (ses autres onglets et appareils se remettent à jour)', async () => {
      const { s, prisma, signaux } = monter();
      await s.marquerLues('S1', 'U1');
      expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ destinataireId: 'U1', societeId: 'S1' }) }),
      );
      // « lue » : remet les compteurs à jour, sans tournée de notifications système.
      expect(signaux).toEqual([{ societeId: 'S1', destinataireIds: ['U1'], kind: 'read' }]);
    });

    it('écriture en échec : l’erreur remonte, aucun signal', async () => {
      const { s, prisma, signaux } = monter();
      (prisma.notification.updateMany as jest.Mock).mockRejectedValue(new Error('base indisponible'));
      await expect(s.marquerLues('S1', 'U1')).rejects.toThrow('base indisponible');
      expect(signaux).toEqual([]);
    });
  });
});
