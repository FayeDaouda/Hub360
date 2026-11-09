import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

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
  return { s: new NotificationsService(prisma), createMany, usrFindMany };
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
    return { s: new NotificationsService(prisma), createMany, update, create, findMany, findUnique };
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
