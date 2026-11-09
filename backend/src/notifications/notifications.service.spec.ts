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
