import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from './roles.service';

// Deux comportements à verrouiller : la liste expose les rôles transverses
// (societeId null) pour transparence, et majPermission refuse d'éditer un
// rôle qui n'appartient pas à la société de l'appelant — que ce soit un
// rôle transverse (CEO/CTO/CIO, réservé au CIO holding) ou, plus grave,
// celui d'une AUTRE société (cloisonnement).

function svc(opts: {
  roles?: unknown[];
  modules?: unknown[];
  roleTrouve?: unknown;
  moduleTrouve?: unknown;
} = {}) {
  const upsert = jest.fn().mockResolvedValue({});
  const prisma = {
    role: {
      findMany: jest.fn().mockResolvedValue(opts.roles ?? []),
      findUnique: jest.fn().mockResolvedValue(opts.roleTrouve ?? null),
    },
    module: {
      findMany: jest.fn().mockResolvedValue(opts.modules ?? []),
      findUnique: jest.fn().mockResolvedValue(opts.moduleTrouve ?? null),
    },
    rolePermission: { upsert },
  } as unknown as PrismaService;
  return { svc: new RolesService(prisma), upsert };
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
    const res = await s.listerAvecPermissions('S1');
    expect(res.roles).toEqual([
      { id: 'R1', nom: 'Dir. GC', transverse: false, permissions: {} },
      { id: 'R2', nom: 'CEO (transverse)', transverse: true, permissions: {} },
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
    const res = await s.listerAvecPermissions('S1');
    expect(res.roles[0].permissions).toEqual({
      finances_marges: 'validation',
      crm: 'lecture',
    });
  });
});

describe('RolesService.majPermission', () => {
  it('AUTORISÉ : rôle propre à la société → upsert la permission', async () => {
    const { svc: s, upsert } = svc({
      roleTrouve: { id: 'R1', societeId: 'S1' },
      moduleTrouve: { id: 'M1', cle: 'crm' },
    });
    await expect(s.majPermission('S1', 'R1', 'crm', 'ecriture')).resolves.toEqual({
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

  it('REFUSÉ : rôle transverse (societeId null) → 403, pas d’upsert', async () => {
    const { svc: s, upsert } = svc({ roleTrouve: { id: 'R2', societeId: null } });
    await expect(s.majPermission('S1', 'R2', 'crm', 'lecture')).rejects.toThrow(
      ForbiddenException,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('REFUSÉ : rôle d’une autre société → 403, pas d’upsert', async () => {
    const { svc: s, upsert } = svc({ roleTrouve: { id: 'R3', societeId: 'AUTRE' } });
    await expect(s.majPermission('S1', 'R3', 'crm', 'lecture')).rejects.toThrow(
      ForbiddenException,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rôle introuvable → 404', async () => {
    const { svc: s } = svc({ roleTrouve: null });
    await expect(s.majPermission('S1', 'INEXISTANT', 'crm', 'lecture')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('module introuvable → 404', async () => {
    const { svc: s } = svc({ roleTrouve: { id: 'R1', societeId: 'S1' }, moduleTrouve: null });
    await expect(s.majPermission('S1', 'R1', 'inexistant', 'lecture')).rejects.toThrow(
      NotFoundException,
    );
  });
});
