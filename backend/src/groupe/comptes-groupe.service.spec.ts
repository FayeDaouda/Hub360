import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ComptesGroupeService } from './comptes-groupe.service';

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
  remuneration: null,
};

function mockPrisma(o: {
  societes?: unknown[];
  roles?: unknown[];
  affectationsListe?: unknown[];
  role?: unknown;
  societe?: unknown;
  affectations?: unknown[];
  utilisateur?: unknown;
}) {
  const tx = jest.fn().mockResolvedValue([]);
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
          Promise.resolve(where.utilisateurId ? (o.affectations ?? []) : (o.affectationsListe ?? [])),
        ),
      deleteMany: jest.fn().mockReturnValue('deleteMany'),
      create: jest.fn().mockReturnValue('create'),
    },
    utilisateur: {
      update: jest.fn().mockReturnValue('update'),
      findUnique: jest.fn().mockResolvedValue(o.utilisateur ?? null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(UTIL),
    },
    remuneration: {
      upsert: jest.fn().mockReturnValue('upsert'),
      deleteMany: jest.fn().mockReturnValue('remDelete'),
    },
    evenementCompte: { create: jest.fn().mockReturnValue('audit') },
    $transaction: tx,
  };
  return { svc: new ComptesGroupeService(prisma as unknown as PrismaService), prisma, tx };
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
        { societeId: 'S1', role: { id: 'R1', nom: 'CFO' }, utilisateur: { ...UTIL, id: 'U2', nom: 'Sow', actif: false, motDePasseHash: null } },
        { societeId: 'S1', role: { id: 'RA', nom: 'societe_admin' }, utilisateur: { ...UTIL, remuneration: { salaireBrutMensuel: 900000 } } },
      ],
    });
    const { societes } = await svc.lister();
    expect(societes[0].rolesAttribuables).toEqual([
      { id: 'R1', nom: 'CFO', transverse: false },
      { id: 'R2', nom: 'CEO (transverse)', transverse: true },
    ]);
    expect(societes[0].comptes.map((c) => [c.nom, c.statut, c.administration, c.salaireBrutMensuel])).toEqual([
      ['Sarr', 'actif', true, 900000],
      ['Sow', 'en_attente', false, null],
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

  it('remplace l’affectation, coupe les sessions (maintenant, à la ms) et journalise', async () => {
    const { svc, prisma, tx } = mockPrisma(base);
    const avant = Date.now();
    const res = await svc.changerRole('U1', 'S1', 'R1', 'ADM');
    expect(tx).toHaveBeenCalledWith(['deleteMany', 'create', 'update', 'audit']);
    expect(prisma.utilisateurSocieteRole.deleteMany).toHaveBeenCalledWith({ where: { utilisateurId: 'U1', societeId: 'S1' } });
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

describe('ComptesGroupeService.definirSalaire', () => {
  it('404 sur un compte inconnu', async () => {
    const { svc } = mockPrisma({});
    await expect(svc.definirSalaire('U1', 500000, 'ADM')).rejects.toThrow(NotFoundException);
  });

  it('enregistre le montant sans le recopier dans le journal', async () => {
    const { svc, prisma, tx } = mockPrisma({ utilisateur: { id: 'U1', remuneration: null } });
    await svc.definirSalaire('U1', 750000, 'ADM');
    expect(tx).toHaveBeenCalledWith(['upsert', 'audit']);
    expect(prisma.remuneration.upsert.mock.calls[0][0].create).toEqual({
      utilisateurId: 'U1',
      salaireBrutMensuel: 750000,
      majParId: 'ADM',
    });
    expect(JSON.stringify(prisma.evenementCompte.create.mock.calls[0][0])).not.toContain('750');
  });

  it('null retire le salaire', async () => {
    const { svc, tx } = mockPrisma({ utilisateur: { id: 'U1', remuneration: { salaireBrutMensuel: 1 } } });
    await svc.definirSalaire('U1', null, 'ADM');
    expect(tx).toHaveBeenCalledWith(['remDelete', 'audit']);
  });

  it('montant inchangé : aucune écriture', async () => {
    const { svc, tx } = mockPrisma({ utilisateur: { id: 'U1', remuneration: { salaireBrutMensuel: 750000 } } });
    await svc.definirSalaire('U1', 750000, 'ADM');
    expect(tx).not.toHaveBeenCalled();
  });
});
