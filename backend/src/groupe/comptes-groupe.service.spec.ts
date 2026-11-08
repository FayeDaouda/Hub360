import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ComptesGroupeService } from './comptes-groupe.service';
import type { ComptesService } from '../auth/comptes.service';
import type { NotificationsService } from '../notifications/notifications.service';

// Règles verrouillées : un rôle par personne et par société, rôles
// d'administration hors de portée de cet écran, cloisonnement des rôles
// propres à une société, coupure des sessions au changement de rôle, et un
// salaire qui ne fuit jamais dans le journal d'audit.

const UTIL = {
  id: 'U1',
  prenom: 'Awa',
  nom: 'Sarr',
  email: 'awa@x.sn',
  actif: true,
  motDePasseHash: 'h',
};

function mockPrisma(o: {
  societes?: unknown[];
  roles?: unknown[];
  affectationsListe?: unknown[];
  role?: unknown;
  societe?: unknown;
  affectations?: unknown[];
  // Toutes les affectations du compte (sociétés et transverses) ; à défaut,
  // celles de la société.
  toutesAffectations?: unknown[];
  utilisateur?: unknown;
  dossier?: unknown;
  cellule?: unknown;
  dossiers?: unknown[];
}) {
  const tx = jest.fn().mockResolvedValue([]);
  const invitation = jest.fn().mockResolvedValue({ lien: 'http://x/activer?token=t', emailEnvoye: false });
  const prisma = {
    societe: {
      findMany: jest.fn().mockResolvedValue(o.societes ?? []),
      findUnique: jest.fn().mockResolvedValue(o.societe ?? null),
    },
    role: {
      findMany: jest.fn().mockResolvedValue(o.roles ?? []),
      findFirst: jest.fn().mockResolvedValue(o.role ?? null),
    },
    utilisateurSocieteRole: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            where.utilisateurId && where.societeId
              ? (o.affectations ?? [])
              : where.utilisateurId
                ? (o.toutesAffectations ?? o.affectations ?? [])
                : (o.affectationsListe ?? []),
          ),
        ),
      deleteMany: jest.fn().mockReturnValue('deleteMany'),
      create: jest.fn().mockReturnValue('create'),
    },
    utilisateur: {
      update: jest.fn().mockReturnValue('update'),
      findUnique: jest.fn().mockResolvedValue(o.utilisateur ?? null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(UTIL),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...UTIL, id: 'UN', ...data })),
    },
    evenementCompte: { create: jest.fn().mockReturnValue('audit') },
    dossierPersonnel: {
      findMany: jest.fn().mockResolvedValue(o.dossiers ?? []),
      findUnique: jest.fn().mockResolvedValue(o.dossier ?? null),
      update: jest.fn(),
    },
    cellule: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(o.cellule ?? null),
    },
    collaborateur: { create: jest.fn().mockResolvedValue({ id: 'C9' }), update: jest.fn() },
    $transaction: tx,
  };
  const comptes = {
    envoyerInvitation: invitation,
    avertirSecurite: jest.fn(),
    motDePasseOublie: jest.fn().mockResolvedValue(undefined),
  } as unknown as ComptesService;
  const notifications = { envoyer: jest.fn(), titulairesRole: jest.fn().mockResolvedValue(['DG']) };
  return {
    svc: new ComptesGroupeService(
      prisma as unknown as PrismaService,
      comptes,
      notifications as unknown as NotificationsService,
    ),
    prisma,
    tx,
    invitation,
    notifications,
    comptes,
  };
}

describe('ComptesGroupeService.lister', () => {
  it('rôles attribuables = rôles de la société + transverses, comptes triés et statut dérivé', async () => {
    const { svc } = mockPrisma({
      societes: [{ id: 'S1', nom: 'Grey Concrete', slug: 'grey-concrete' }],
      roles: [
        { id: 'R1', nom: 'CFO', societeId: 'S1' },
        { id: 'R2', nom: 'CEO (transverse)', societeId: null },
        { id: 'R3', nom: 'Autre', societeId: 'S2' },
      ],
      affectationsListe: [
        {
          societeId: 'S1',
          role: { id: 'R1', nom: 'CFO' },
          utilisateur: { ...UTIL, id: 'U2', nom: 'Sow', actif: false, motDePasseHash: null },
        },
        { societeId: 'S1', role: { id: 'RA', nom: 'societe_admin' }, utilisateur: { ...UTIL } },
      ],
    });
    const { societes } = await svc.lister();
    expect(societes[0].rolesAttribuables).toEqual([
      { id: 'R1', nom: 'CFO', transverse: false },
      { id: 'R2', nom: 'CEO (transverse)', transverse: true },
    ]);
    // Pas de salaire ici : sa seule source est le dossier RH (D19, 20/10/2026).
    expect(societes[0].comptes.map((c) => [c.nom, c.statut, c.administration, 'salaireBrutMensuel' in c])).toEqual([
      ['Sarr', 'actif', true, false],
      ['Sow', 'en_attente', false, false],
    ]);
  });

  it('une seule ligne par personne ; le rôle d’administration l’emporte', async () => {
    const { svc } = mockPrisma({
      societes: [{ id: 'S1', nom: 'G', slug: 'g' }],
      affectationsListe: [
        { societeId: 'S1', role: { id: 'RC', nom: 'collaborateur' }, utilisateur: UTIL },
        { societeId: 'S1', role: { id: 'RA', nom: 'societe_admin' }, utilisateur: UTIL },
      ],
    });
    const { societes } = await svc.lister();
    expect(societes[0].comptes).toHaveLength(1);
    expect(societes[0].comptes[0].role.nom).toBe('societe_admin');
  });
});

describe('ComptesGroupeService.changerRole', () => {
  const base = {
    role: { id: 'R1', nom: 'CFO', societeId: 'S1' },
    societe: { id: 'S1', nom: 'Grey Concrete' },
    affectations: [{ roleId: 'RC', role: { id: 'RC', nom: 'collaborateur' } }],
  };

  it('409 sur son propre rôle (le CIO ne se retire pas ses pouvoirs)', async () => {
    const { svc, tx } = mockPrisma(base);
    await expect(svc.changerRole('ADM', 'S1', 'R1', 'ADM')).rejects.toThrow('propre rôle');
    expect(tx).not.toHaveBeenCalled();
  });

  it('refuse un rôle d’administration', async () => {
    const { svc } = mockPrisma({ ...base, role: { id: 'RA', nom: 'societe_admin', societeId: null } });
    await expect(svc.changerRole('U1', 'S1', 'RA', 'ADM')).rejects.toThrow(BadRequestException);
  });

  it('refuse le rôle propre à une autre société', async () => {
    const { svc } = mockPrisma({ ...base, role: { id: 'R9', nom: 'CFO', societeId: 'S2' } });
    await expect(svc.changerRole('U1', 'S1', 'R9', 'ADM')).rejects.toThrow('autre société');
  });

  it('404 si le compte n’est pas rattaché à la société', async () => {
    const { svc } = mockPrisma({ ...base, affectations: [] });
    await expect(svc.changerRole('U1', 'S1', 'R1', 'ADM')).rejects.toThrow(NotFoundException);
  });

  it('409 sur un compte d’administration', async () => {
    const { svc } = mockPrisma({ ...base, affectations: [{ roleId: 'RA', role: { id: 'RA', nom: 'societe_admin' } }] });
    await expect(svc.changerRole('U1', 'S1', 'R1', 'ADM')).rejects.toThrow(ConflictException);
  });

  it('409 sur un Administrateur HUB qui porte aussi un rôle ordinaire dans la société', async () => {
    const { svc, tx } = mockPrisma({
      ...base,
      toutesAffectations: [{ role: { nom: 'collaborateur' } }, { role: { nom: 'Administrateur HUB (transverse)' } }],
    });
    await expect(svc.changerRole('U1', 'S1', 'R1', 'ADM')).rejects.toThrow('son rôle ne se modifie pas');
    expect(tx).not.toHaveBeenCalled();
  });

  it('remplace l’affectation, coupe les sessions (maintenant, à la ms) et journalise', async () => {
    const { svc, prisma, tx } = mockPrisma(base);
    const avant = Date.now();
    const res = await svc.changerRole('U1', 'S1', 'R1', 'ADM');
    expect(tx).toHaveBeenCalledWith(['deleteMany', 'create', 'update', 'audit']);
    expect(prisma.utilisateurSocieteRole.deleteMany).toHaveBeenCalledWith({
      where: { utilisateurId: 'U1', societeId: 'S1' },
    });
    // Pas de troncature à la seconde : un jeton de l'ancien rôle émis dans la
    // même seconde doit être refusé (iat * 1000 < coupure).
    const coupure: Date = prisma.utilisateur.update.mock.calls[0][0].data.sessionsValidesDepuis;
    expect(coupure.getTime()).toBeGreaterThanOrEqual(avant);
    expect(prisma.evenementCompte.create.mock.calls[0][0].data).toMatchObject({
      type: 'role_modifie',
      parId: 'ADM',
      detail: 'collaborateur → CFO (Grey Concrete)',
    });
    expect(res.role).toEqual({ id: 'R1', nom: 'CFO' });
  });

  it('même rôle : aucune écriture, aucune session coupée', async () => {
    const { svc, tx } = mockPrisma({ ...base, affectations: [{ roleId: 'R1', role: { id: 'R1', nom: 'CFO' } }] });
    await svc.changerRole('U1', 'S1', 'R1', 'ADM');
    expect(tx).not.toHaveBeenCalled();
  });
});

describe('ComptesGroupeService.creerCompte — dossier RH → compte → rôle (cellule : le Dir. GC)', () => {
  const DOSSIER = {
    id: 'D1',
    societeId: 'S1',
    prenom: 'Fatou',
    nom: 'Ba',
    poste: 'Dessinatrice',
    dateEntree: '2026-01-05',
    archiveLe: null,
    utilisateurId: null,
    collaborateur: null,
  };
  const ROLE = { id: 'RS', nom: 'Salarié', societeId: 'S1' };
  const DTO = { dossierId: 'D1', email: ' Fatou.Ba@GC.sn ', roleId: 'RS' };
  function pret(o: Parameters<typeof mockPrisma>[0] = {}) {
    const m = mockPrisma({ dossier: DOSSIER, role: ROLE, cellule: { id: 'CE1' }, ...o });
    m.tx.mockImplementation((fn: (t: unknown) => unknown) => fn(m.prisma));
    return m;
  }

  it('Salarié : compte inactif + rôle + fiche d’équipe SANS cellule, invitation, Dir. GC prévenu', async () => {
    const { svc, prisma, invitation, notifications } = pret();
    const res = await svc.creerCompte(DTO, 'CIO');
    expect(prisma.utilisateur.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'fatou.ba@gc.sn', prenom: 'Fatou', actif: false, motDePasseHash: null }),
      }),
    );
    expect(prisma.utilisateurSocieteRole.create).toHaveBeenCalledWith({
      data: { utilisateurId: 'UN', societeId: 'S1', roleId: 'RS' },
    });
    expect(prisma.collaborateur.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: 'Dessinatrice', dateArrivee: '2026-01-05', utilisateurId: 'UN' }),
    });
    expect(prisma.collaborateur.create.mock.calls[0][0].data).not.toHaveProperty('celluleId');
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'arrivant_a_affecter',
        destinataireIds: ['DG'],
        titre: 'Nouvel arrivant à affecter · Fatou Ba · Dessinatrice',
      }),
    );
    expect(prisma.dossierPersonnel.update).toHaveBeenCalledWith({
      where: { id: 'D1' },
      data: { collaborateurId: 'C9' },
    });
    expect(invitation).toHaveBeenCalledWith('UN', 'fatou.ba@gc.sn', 'Fatou', 'CIO');
    expect(res.lien).toContain('/activer');
  });

  it('compte de direction : pas de fiche d’équipe, le dossier est relié directement au compte, personne à affecter', async () => {
    const { svc, prisma, notifications } = pret({ role: { id: 'RC', nom: 'CFO', societeId: 'S1' } });
    await svc.creerCompte({ ...DTO, roleId: 'RC' }, 'CIO');
    expect(prisma.collaborateur.create).not.toHaveBeenCalled();
    expect(notifications.envoyer).not.toHaveBeenCalled();
    expect(prisma.dossierPersonnel.update).toHaveBeenCalledWith({ where: { id: 'D1' }, data: { utilisateurId: 'UN' } });
  });

  it('dossier relié à une fiche d’équipe existante : la fiche reçoit le compte', async () => {
    const { svc, prisma } = pret({ dossier: { ...DOSSIER, collaborateur: { id: 'C1', utilisateurId: null } } });
    await svc.creerCompte(DTO, 'CIO');
    expect(prisma.collaborateur.create).not.toHaveBeenCalled();
    expect(prisma.collaborateur.update).toHaveBeenCalledWith({ where: { id: 'C1' }, data: { utilisateurId: 'UN' } });
  });

  it.each([
    ['dossier déjà avec compte', { dossier: { ...DOSSIER, utilisateurId: 'UX' } }, ConflictException],
    ['dossier archivé', { dossier: { ...DOSSIER, archiveLe: new Date() } }, NotFoundException],
    ['e-mail déjà pris', { utilisateur: { id: 'UX' } }, ConflictException],
    ['rôle d’administration', { role: { id: 'RA', nom: 'societe_admin', societeId: null } }, BadRequestException],
    ['rôle d’une autre société', { role: { id: 'RX', nom: 'CFO', societeId: 'S2' } }, BadRequestException],
  ])('refus : %s', async (_l, o, erreur) => {
    const { svc, prisma, invitation } = pret(o as Parameters<typeof mockPrisma>[0]);
    await expect(svc.creerCompte(DTO, 'CIO')).rejects.toThrow(erreur);
    expect(prisma.utilisateur.create).not.toHaveBeenCalled();
    expect(invitation).not.toHaveBeenCalled();
  });
});

describe('ComptesGroupeService.changerActif', () => {
  const avecRoles = (nom: string, extra = {}) => ({ ...UTIL, roles: [{ role: { nom } }], ...extra });

  it('désactiver : compte coupé + sessions révoquées + journal', async () => {
    const { svc, prisma, tx } = mockPrisma({ utilisateur: avecRoles('Salarié') });
    tx.mockResolvedValue([{ ...UTIL, actif: false }]);
    const res = await svc.changerActif('U1', false, 'CIO');
    expect(prisma.utilisateur.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actif: false, sessionsValidesDepuis: expect.any(Date) }),
      }),
    );
    expect(prisma.evenementCompte.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'compte_desactive' }),
    });
    expect(res.statut).toBe('desactive');
  });

  it.each([
    ['soi-même', 'U1', avecRoles('Salarié')],
    ['compte d’administration', 'CIO', avecRoles('societe_admin')],
    ['invitation en attente', 'CIO', avecRoles('Salarié', { motDePasseHash: null, actif: false })],
  ])('refus : %s', async (_l, acteur, utilisateur) => {
    const { svc } = mockPrisma({ utilisateur });
    await expect(svc.changerActif('U1', false, acteur)).rejects.toThrow(ConflictException);
  });
});

describe('ComptesGroupeService.reinitialiserDoubleFacteur', () => {
  it('retire la double authentification, coupe les sessions et prévient la personne (lot A)', async () => {
    const { svc, comptes } = mockPrisma({
      utilisateur: {
        totpSecret: 'chiffré',
        totpActifLe: new Date(),
        email: 'awa@exemple.sn',
        prenom: 'Awa',
        roles: [{ role: { nom: 'CFO' } }],
      },
    });
    await expect(svc.reinitialiserDoubleFacteur('U1', 'CIO')).resolves.toEqual({ id: 'U1', doubleFacteur: false });
    expect(comptes.avertirSecurite).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'awa@exemple.sn', prenom: 'Awa' }),
      'double_facteur_reinitialise',
    );
  });
});

describe('ComptesGroupeService.debloquer (lot C)', () => {
  it('débloque avant la fin : compteurs remis à zéro, trace au journal', async () => {
    const { svc, prisma, tx } = mockPrisma({
      utilisateur: { verrouilleJusquau: new Date(Date.now() + 600_000), roles: [{ role: { nom: 'CFO' } }] },
    });
    await expect(svc.debloquer('U1', 'CIO')).resolves.toEqual({ id: 'U1', verrouilleJusquau: null });
    expect(prisma.utilisateur.update).toHaveBeenCalledWith({
      where: { id: 'U1' },
      data: { verrouilleJusquau: null, echecsConnexion: 0, verrouillages: 0 },
    });
    expect(prisma.evenementCompte.create.mock.calls[0][0].data).toMatchObject({
      type: 'compte_debloque',
      parId: 'CIO',
    });
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it('compte non verrouillé (ou verrouillage échu) → 409 ; inconnu → 404', async () => {
    const echu = mockPrisma({ utilisateur: { verrouilleJusquau: new Date(Date.now() - 1000), roles: [] } });
    await expect(echu.svc.debloquer('U1', 'CIO')).rejects.toThrow(ConflictException);
    await expect(mockPrisma({}).svc.debloquer('U1', 'CIO')).rejects.toThrow(NotFoundException);
  });
});

describe('ComptesGroupeService · sessions et mot de passe (Administration du HUB)', () => {
  const avecRoles = (nom: string, extra = {}) => ({ ...UTIL, roles: [{ role: { nom } }], ...extra });

  it('couper les sessions : coupure datée, trace au journal', async () => {
    const { svc, prisma, tx } = mockPrisma({ utilisateur: avecRoles('CFO') });
    await expect(svc.couperSessions('U1', 'ADM')).resolves.toEqual({ id: 'U1' });
    expect(prisma.utilisateur.update).toHaveBeenCalledWith({
      where: { id: 'U1' },
      data: { sessionsValidesDepuis: expect.any(Date) },
    });
    expect(prisma.evenementCompte.create.mock.calls[0][0].data).toMatchObject({
      type: 'deconnexion_partout',
      parId: 'ADM',
    });
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it('lien de réinitialisation : même e-mail que « mot de passe oublié », trace au journal', async () => {
    const { svc, prisma, comptes } = mockPrisma({ utilisateur: avecRoles('CFO') });
    await expect(svc.envoyerReinitialisation('U1', 'ADM')).resolves.toEqual({ id: 'U1', email: 'awa@x.sn' });
    expect(comptes.motDePasseOublie).toHaveBeenCalledWith('awa@x.sn');
    expect(prisma.evenementCompte.create.mock.calls[0][0].data).toMatchObject({
      type: 'lien_reinitialisation_envoye',
      parId: 'ADM',
    });
  });

  it.each([
    ['ses propres sessions', () => mockPrisma({ utilisateur: avecRoles('CFO') }).svc.couperSessions('U1', 'U1')],
    [
      'compte d’administration',
      () => mockPrisma({ utilisateur: avecRoles('Administrateur HUB (transverse)') }).svc.couperSessions('U1', 'ADM'),
    ],
    [
      'invitation en attente',
      () =>
        mockPrisma({ utilisateur: avecRoles('CFO', { motDePasseHash: null }) }).svc.envoyerReinitialisation(
          'U1',
          'ADM',
        ),
    ],
  ])('refus : %s', async (_l, appel) => {
    await expect(appel()).rejects.toThrow(ConflictException);
  });
});

// Comptes d'administration (Administrateur HUB, comptes de secours) : aucune
// action depuis l'Administration du HUB, pas plus sur le serveur qu'à
// l'écran (08/11/2026). Le CIO, lui, reste un compte ordinaire.
describe('ComptesGroupeService · comptes d’administration hors de portée', () => {
  const ADMINISTRATION = ['Administrateur HUB (transverse)', 'holding_admin', 'societe_admin'];
  const compteAdmin = (nom: string) => ({
    ...UTIL,
    motDePasseHash: null,
    totpSecret: 'chiffré',
    totpActifLe: new Date(),
    verrouilleJusquau: new Date(Date.now() + 600_000),
    roles: [{ role: { nom } }],
  });

  it.each(ADMINISTRATION)('%s : double authentification, déblocage et invitation refusés (409)', async (nom) => {
    for (const appel of [
      (svc: ComptesGroupeService) => svc.reinitialiserDoubleFacteur('U1', 'CIO'),
      (svc: ComptesGroupeService) => svc.debloquer('U1', 'CIO'),
      (svc: ComptesGroupeService) => svc.renvoyerInvitation('U1', 'CIO'),
    ]) {
      const { svc, tx, prisma, comptes, invitation } = mockPrisma({ utilisateur: compteAdmin(nom) });
      await expect(appel(svc)).rejects.toThrow("Compte d'administration : il ne se gère pas depuis cet écran.");
      // Rien n'est écrit, rien n'est envoyé.
      expect(tx).not.toHaveBeenCalled();
      expect(prisma.utilisateur.update).not.toHaveBeenCalled();
      expect(comptes.avertirSecurite).not.toHaveBeenCalled();
      expect(invitation).not.toHaveBeenCalled();
    }
  });

  it('sa propre double authentification ne se retire pas depuis cet écran (409, sans lecture)', async () => {
    const { svc, prisma } = mockPrisma({
      utilisateur: { ...UTIL, totpActifLe: new Date(), roles: [{ role: { nom: 'CFO' } }] },
    });
    await expect(svc.reinitialiserDoubleFacteur('U1', 'U1')).rejects.toThrow(ConflictException);
    expect(prisma.utilisateur.findUnique).not.toHaveBeenCalled();
  });

  it('le CIO reste dépannable : sa double authentification se retire', async () => {
    const { svc, tx } = mockPrisma({
      utilisateur: {
        totpSecret: 's',
        totpActifLe: new Date(),
        email: 'cio@x.sn',
        prenom: 'C',
        roles: [{ role: { nom: 'CIO (transverse)' } }],
      },
    });
    await expect(svc.reinitialiserDoubleFacteur('U-CIO', 'ADMIN-HUB')).resolves.toEqual({
      id: 'U-CIO',
      doubleFacteur: false,
    });
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it('une invitation ordinaire se renvoie toujours', async () => {
    const { svc, invitation } = mockPrisma({
      utilisateur: { ...UTIL, actif: false, motDePasseHash: null, roles: [{ role: { nom: 'Salarié' } }] },
    });
    await svc.renvoyerInvitation('U1', 'CIO');
    expect(invitation).toHaveBeenCalledWith('U1', 'awa@x.sn', 'Awa', 'CIO');
  });
});
