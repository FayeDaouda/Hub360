import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SwitchesService } from './switches.service';

// Interrupteurs : un module coupé vaut « aucun » pour la société, chaque
// bascule est une intervention au journal, le cache est vidé à la bascule ;
// la maintenance refuse tout le monde sauf l'Administrateur HUB.

function setup(o: { coupes?: string[]; maintenance?: { actif: boolean; message: string } | null } = {}) {
  const coupes = o.coupes ?? [];
  const prisma = {
    moduleDesactive: {
      findMany: jest
        .fn()
        .mockResolvedValue(coupes.map((moduleCle) => ({ moduleCle, createdAt: new Date(), motif: 'm' }))),
      findUnique: jest.fn().mockResolvedValue(coupes.length ? { moduleCle: coupes[0] } : null),
      create: jest.fn().mockReturnValue('create'),
      delete: jest.fn().mockReturnValue('delete'),
    },
    module: {
      findUnique: jest.fn().mockResolvedValue({ nom: 'CRM' }),
      findMany: jest.fn().mockResolvedValue([{ cle: 'crm', nom: 'CRM' }]),
    },
    maintenanceHub: {
      findUnique: jest.fn().mockResolvedValue(o.maintenance ?? null),
      upsert: jest.fn().mockReturnValue('upsert'),
    },
    interventionHub: { create: jest.fn().mockReturnValue('intervention') },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return { svc: new SwitchesService(prisma as unknown as PrismaService), prisma };
}

describe('SwitchesService', () => {
  it('modules coupés : lecture mise en cache', async () => {
    const { svc, prisma } = setup({ coupes: ['crm'] });
    expect(await svc.disabledModules('S1')).toEqual(new Set(['crm']));
    await svc.disabledModules('S1');
    expect(prisma.moduleDesactive.findMany).toHaveBeenCalledTimes(1);
  });

  it('couper un module : ligne créée, intervention motivée, cache vidé', async () => {
    const { svc, prisma } = setup();
    await svc.disabledModules('S1');
    await svc.setModule('S1', 'crm', false, 'Pas encore utilisé', 'ADM');
    expect(prisma.moduleDesactive.create).toHaveBeenCalledWith({
      data: { societeId: 'S1', moduleCle: 'crm', motif: 'Pas encore utilisé', parId: 'ADM' },
    });
    expect(prisma.interventionHub.create.mock.calls[0][0].data).toMatchObject({
      type: 'module_desactive',
      cible: 'crm',
      detail: 'CRM désactivé',
      motif: 'Pas encore utilisé',
    });
    await svc.disabledModules('S1');
    expect(prisma.moduleDesactive.findMany).toHaveBeenCalledTimes(3); // avant, état rendu, après la bascule
  });

  it('réactiver : ligne supprimée ; déjà dans l’état demandé : rien n’est écrit', async () => {
    const coupe = setup({ coupes: ['crm'] });
    await coupe.svc.setModule('S1', 'crm', true, 'Prêt', 'ADM');
    expect(coupe.prisma.moduleDesactive.delete).toHaveBeenCalled();
    expect(coupe.prisma.interventionHub.create.mock.calls[0][0].data.type).toBe('module_reactive');
    const actif = setup();
    await actif.svc.setModule('S1', 'crm', true, 'Prêt', 'ADM');
    expect(actif.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('module inconnu → 404', async () => {
    const { svc, prisma } = setup();
    prisma.module.findUnique.mockResolvedValue(null);
    await expect(svc.setModule('S1', 'inconnu', false, 'm', 'ADM')).rejects.toThrow(NotFoundException);
  });

  it('maintenance : refus avec le message, sauf pour l’Administrateur HUB ; levée = aucun refus', async () => {
    const ferme = setup({ maintenance: { actif: true, message: 'Mise à jour ce soir' } });
    await expect(ferme.svc.refuseDuringMaintenance(false)).rejects.toThrow(
      new ServiceUnavailableException('Mise à jour ce soir'),
    );
    await expect(ferme.svc.refuseDuringMaintenance(true)).resolves.toBeUndefined();
    await expect(setup().svc.refuseDuringMaintenance(false)).resolves.toBeUndefined();
  });

  it('activer la maintenance : ligne unique, intervention au journal de la société de connexion', async () => {
    const { svc, prisma } = setup();
    await svc.setMaintenance('S1', true, 'Mise à jour', 'Migration', 'ADM');
    expect(prisma.maintenanceHub.upsert).toHaveBeenCalledWith({
      where: { id: 'hub' },
      create: { id: 'hub', actif: true, message: 'Mise à jour', parId: 'ADM' },
      update: { actif: true, message: 'Mise à jour', parId: 'ADM' },
    });
    expect(prisma.interventionHub.create.mock.calls[0][0].data).toMatchObject({
      societeId: 'S1',
      type: 'maintenance_activee',
      cible: 'HUB',
      detail: 'Maintenance : « Mise à jour »',
    });
  });
});
