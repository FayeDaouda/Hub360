import { RightsService } from './rights.service';

// Base simulée : deux étapes (« crm » du module crm, « crm.dossiers » du même
// module), un rôle CFO dans la société S1.
function setup(o: { coupes?: string[] } = {}) {
  const prisma = {
    utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([{ societeId: 'S1', roleId: 'R-CFO' }]) },
    roleRight: {
      findMany: jest.fn().mockResolvedValue([
        { etape: { cle: 'crm' }, lecture: true, ecriture: false, validation: true, suppression: false },
        { etape: { cle: 'crm.dossiers' }, lecture: true, ecriture: true, validation: false, suppression: false },
        { etape: { cle: 'rh' }, lecture: false, ecriture: false, validation: false, suppression: false },
      ]),
    },
    moduleStep: {
      findMany: jest.fn().mockResolvedValue([
        { cle: 'crm', module: { cle: 'crm' } },
        { cle: 'crm.dossiers', module: { cle: 'crm' } },
        { cle: 'rh', module: { cle: 'rh' } },
      ]),
    },
  };
  const switches = { disabledModules: jest.fn().mockResolvedValue(new Set(o.coupes ?? [])) };
  return { svc: new RightsService(prisma as never, switches as never), prisma };
}

const CFO = { userId: 'U1', societeId: 'S1', role: 'CFO' };

describe('RightsService', () => {
  it('droits du rôle en lettres ; une étape sans aucun droit est absente', async () => {
    const { svc } = setup();
    expect(await svc.forUser(CFO)).toEqual({ crm: 'LV', 'crm.dossiers': 'LE' });
  });

  it('module coupé pour la société : toutes ses étapes disparaissent', async () => {
    const { svc } = setup({ coupes: ['crm'] });
    expect(await svc.forUser(CFO)).toEqual({});
  });

  it('carte blanche : CIO et Administrateur HUB ont les quatre droits partout', async () => {
    const { svc, prisma } = setup({ coupes: ['crm'] });
    const tout = { crm: 'LEVS', 'crm.dossiers': 'LEVS', rh: 'LEVS' };
    expect(await svc.forUser({ ...CFO, role: 'CIO (transverse)' })).toEqual(tout);
    expect(await svc.forUser({ ...CFO, adminHub: true })).toEqual(tout);
    expect(prisma.roleRight.findMany).not.toHaveBeenCalled();
  });

  it('mis en mémoire, relu après invalidate() (changement de la matrice)', async () => {
    const { svc, prisma } = setup();
    await svc.forUser(CFO);
    await svc.forUser(CFO);
    expect(prisma.roleRight.findMany).toHaveBeenCalledTimes(1);
    svc.invalidate();
    await svc.forUser(CFO);
    expect(prisma.roleRight.findMany).toHaveBeenCalledTimes(2);
  });

  it('nouveau rôle porté par le jeton : l’affectation est relue, jamais l’ancienne en mémoire', async () => {
    const { svc, prisma } = setup();
    await svc.forUser(CFO);
    await svc.forUser({ ...CFO, role: 'COO' });
    expect(prisma.utilisateurSocieteRole.findMany).toHaveBeenCalledTimes(2);
  });

  it('sans société ou sans affectation : aucun droit', async () => {
    const { svc, prisma } = setup();
    expect(await svc.forUser({ ...CFO, societeId: null })).toEqual({});
    prisma.utilisateurSocieteRole.findMany.mockResolvedValue([]);
    expect(await svc.forUser({ ...CFO, role: 'RH' })).toEqual({});
  });
});
