import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from './roles.service';
import { ROLE_CIO } from '../commun/societe-admin-ou-cio.guard';

// Gouvernance de la matrice (CIO = super admin du HUB, 28/09/2026) : rôles
// propres → admin société ou CIO ; rôles transverses (CEO/CTO/CIO) → CIO
// seul ; rôles socles → personne ; rôle d'une AUTRE société → jamais
// (cloisonnement). La liste expose `modifiable` selon la même règle.

function svc(opts: {
  roles?: unknown[];
  modules?: unknown[];
  roleTrouve?: unknown;
  moduleTrouve?: unknown;
  permissionActuelle?: unknown;
} = {}) {
  const upsert = jest.fn().mockResolvedValue({});
  const revoquer = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    role: {
      findMany: jest.fn().mockResolvedValue(opts.roles ?? []),
      findUnique: jest.fn().mockResolvedValue(opts.roleTrouve ?? null),
    },
    module: {
      findMany: jest.fn().mockResolvedValue(opts.modules ?? []),
      findUnique: jest.fn().mockResolvedValue(opts.moduleTrouve ?? null),
    },
    rolePermission: {
      upsert,
      findUnique: jest.fn().mockResolvedValue(opts.permissionActuelle ?? null),
    },
    utilisateur: { updateMany: revoquer },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  return { svc: new RolesService(prisma), upsert, revoquer };
}

describe('RolesService.listerAvecPermissions', () => {
  it('expose transverse=true pour un rôle societeId null, false sinon', async () => {
    const { svc: s } = svc({
      roles: [
        { id: 'R1', nom: 'Dir. GC', societeId: 'S1', permissions: [] },
        { id: 'R2', nom: 'CEO (transverse)', societeId: null, permissions: [] },
      ],
      modules: [{ cle: 'crm', nom: 'CRM' }],
    });
    const res = await s.listerAvecPermissions('S1', 'societe_admin');
    expect(res.roles).toEqual([
      { id: 'R1', nom: 'Dir. GC', transverse: false, modifiable: true, permissions: {} },
      { id: 'R2', nom: 'CEO (transverse)', transverse: true, modifiable: false, permissions: {} },
    ]);
  });

  it('modifiable : le CIO édite les transverses, personne n’édite les rôles socles', async () => {
    const { svc: s } = svc({
      roles: [
        { id: 'R2', nom: 'CEO (transverse)', societeId: null, permissions: [] },
        { id: 'RA', nom: 'societe_admin', societeId: null, permissions: [] },
        { id: 'RH', nom: 'holding_admin', societeId: null, permissions: [] },
      ],
    });
    const res = await s.listerAvecPermissions('S1', ROLE_CIO);
    expect(res.roles.map((r) => [r.nom, r.modifiable])).toEqual([
      ['CEO (transverse)', true],
      ['societe_admin', false],
      ['holding_admin', false],
    ]);
  });

  it('regroupe les permissions par cle de module', async () => {
    const { svc: s } = svc({
      roles: [
        {
          id: 'R1',
          nom: 'CFO',
          societeId: 'S1',
          permissions: [
            { module: { cle: 'finances_marges' }, niveau: 'validation' },
            { module: { cle: 'crm' }, niveau: 'lecture' },
          ],
        },
      ],
    });
    const res = await s.listerAvecPermissions('S1', 'societe_admin');
    expect(res.roles[0].permissions).toEqual({
      finances_marges: 'validation',
      crm: 'lecture',
    });
  });
});

describe('RolesService.majPermission', () => {
  it('AUTORISÉ : rôle propre à la société → upsert la permission', async () => {
    const { svc: s, upsert } = svc({
      roleTrouve: { id: 'R1', nom: 'Dir. GC', societeId: 'S1' },
      moduleTrouve: { id: 'M1', cle: 'crm' },
    });
    await expect(s.majPermission('S1', 'R1', 'crm', 'ecriture', 'societe_admin')).resolves.toEqual({
      roleId: 'R1',
      moduleCle: 'crm',
      niveau: 'ecriture',
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { roleId_moduleId: { roleId: 'R1', moduleId: 'M1' } },
      update: { niveau: 'ecriture' },
      create: { roleId: 'R1', moduleId: 'M1', niveau: 'ecriture' },
    });
  });

  it('révoque les sessions de tous les titulaires du rôle (droit appliqué immédiatement)', async () => {
    const { svc: s, revoquer } = svc({
      roleTrouve: { id: 'R1', nom: 'CFO', societeId: 'S1' },
      moduleTrouve: { id: 'M1', cle: 'crm' },
      permissionActuelle: { niveau: 'lecture' },
    });
    await s.majPermission('S1', 'R1', 'crm', 'aucun', 'societe_admin');
    expect(revoquer).toHaveBeenCalledWith({
      where: { roles: { some: { roleId: 'R1' } } },
      data: { sessionsValidesDepuis: expect.any(Date) },
    });
  });

  it('niveau inchangé → ni écriture ni révocation', async () => {
    const { svc: s, upsert, revoquer } = svc({
      roleTrouve: { id: 'R1', nom: 'CFO', societeId: 'S1' },
      moduleTrouve: { id: 'M1', cle: 'crm' },
      permissionActuelle: { niveau: 'lecture' },
    });
    await s.majPermission('S1', 'R1', 'crm', 'lecture', 'societe_admin');
    expect(upsert).not.toHaveBeenCalled();
    expect(revoquer).not.toHaveBeenCalled();
  });

  it('REFUSÉ : rôle transverse par l’admin société → 403, pas d’upsert', async () => {
    const { svc: s, upsert } = svc({ roleTrouve: { id: 'R2', nom: 'CEO (transverse)', societeId: null } });
    await expect(s.majPermission('S1', 'R2', 'crm', 'lecture', 'societe_admin')).rejects.toThrow(
      'CIO',
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('AUTORISÉ : rôle transverse par le CIO', async () => {
    const { svc: s, upsert } = svc({
      roleTrouve: { id: 'R2', nom: 'CEO (transverse)', societeId: null },
      moduleTrouve: { id: 'M1', cle: 'crm' },
    });
    await s.majPermission('S1', 'R2', 'crm', 'lecture', ROLE_CIO);
    expect(upsert).toHaveBeenCalled();
  });

  it('AUTORISÉ : rôle propre à la société par le CIO', async () => {
    const { svc: s, upsert } = svc({
      roleTrouve: { id: 'R1', nom: 'CFO', societeId: 'S1' },
      moduleTrouve: { id: 'M1', cle: 'crm' },
    });
    await s.majPermission('S1', 'R1', 'crm', 'lecture', ROLE_CIO);
    expect(upsert).toHaveBeenCalled();
  });

  it.each([['societe_admin'], ['holding_admin']])(
    'REFUSÉ : rôle socle %s, même par le CIO',
    async (nom) => {
      const { svc: s, upsert } = svc({ roleTrouve: { id: 'RS', nom, societeId: null } });
      await expect(s.majPermission('S1', 'RS', 'crm', 'lecture', ROLE_CIO)).rejects.toThrow(
        ForbiddenException,
      );
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('REFUSÉ : rôle d’une autre société, même par le CIO → 403', async () => {
    const { svc: s, upsert } = svc({ roleTrouve: { id: 'R3', nom: 'CFO', societeId: 'AUTRE' } });
    await expect(s.majPermission('S1', 'R3', 'crm', 'lecture', ROLE_CIO)).rejects.toThrow(
      ForbiddenException,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rôle supprimé → 404', async () => {
    const { svc: s } = svc({ roleTrouve: { id: 'R1', nom: 'CFO', societeId: 'S1', supprimeLe: new Date() } });
    await expect(s.majPermission('S1', 'R1', 'crm', 'lecture', ROLE_CIO)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rôle introuvable → 404', async () => {
    const { svc: s } = svc({ roleTrouve: null });
    await expect(s.majPermission('S1', 'INEXISTANT', 'crm', 'lecture', 'societe_admin')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('module introuvable → 404', async () => {
    const { svc: s } = svc({ roleTrouve: { id: 'R1', nom: 'CFO', societeId: 'S1' }, moduleTrouve: null });
    await expect(s.majPermission('S1', 'R1', 'inexistant', 'lecture', 'societe_admin')).rejects.toThrow(
      NotFoundException,
    );
  });
});
