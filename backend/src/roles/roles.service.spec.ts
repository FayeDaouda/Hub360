import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NO_RIGHTS } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from './roles.service';

// Matrice des droits (31/10/2026) : quatre droits indépendants par rôle et
// par étape ; le CIO et les comptes d'administration hors matrice ; un
// changement s'applique tout de suite (mémoire des droits vidée), avertit
// chaque titulaire du rôle et laisse une trace au CEO.

const ETAPE = {
  id: 'E-crm',
  cle: 'crm',
  nom: 'Ensemble du module',
  libelles: { lecture: 'Voit', ecriture: 'Modifie', suppression: 'Archive' }, // validation sans objet
  module: { cle: 'crm', nom: 'CRM' },
};
const DIR_GC = { id: 'R1', nom: 'Dir. GC', societeId: 'S1', supprimeLe: null };

function svc(o: { role?: unknown; etape?: unknown; actuelle?: unknown; affectations?: unknown[] } = {}) {
  const prisma = {
    role: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(o.role ?? DIR_GC),
    },
    module: { findMany: jest.fn().mockResolvedValue([]) },
    moduleStep: { findUnique: jest.fn().mockResolvedValue(o.etape === undefined ? ETAPE : o.etape) },
    roleRight: {
      findUnique: jest.fn().mockResolvedValue(o.actuelle ?? null),
      upsert: jest.fn((a: unknown) => a),
    },
    journalDroit: { create: jest.fn((a: unknown) => a) },
    utilisateurSocieteRole: {
      findMany: jest.fn().mockResolvedValue(
        o.affectations ?? [
          { utilisateurId: 'U1', societeId: 'S1', roleId: 'R1' },
          { utilisateurId: 'U2', societeId: null, roleId: 'R1' },
        ],
      ),
    },
    rightsNotice: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    utilisateur: { findUnique: jest.fn().mockResolvedValue({ prenom: 'Awa', nom: 'Diallo' }) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const notifications = { envoyer: jest.fn(), titulairesRole: jest.fn().mockResolvedValue(['CEO1']) };
  const rights = { invalidate: jest.fn() };
  return {
    svc: new RolesService(prisma as unknown as PrismaService, notifications as never, rights as never),
    prisma,
    notifications,
    rights,
  };
}

const droits = (lettres: string) => ({
  lecture: lettres.includes('L'),
  ecriture: lettres.includes('E'),
  validation: lettres.includes('V'),
  suppression: lettres.includes('S'),
});

describe('RolesService.matrice', () => {
  it('rôles métier seulement, CIO marqué carte blanche ; étapes avec leurs phrases', async () => {
    const { svc: s, prisma } = svc();
    prisma.role.findMany.mockResolvedValue([
      { id: 'R1', nom: 'Dir. GC', societeId: 'S1', droits: [{ etape: { cle: 'crm' }, ...droits('LE') }] },
      { id: 'R2', nom: 'CIO (transverse)', societeId: null, droits: [] },
      { id: 'RA', nom: 'societe_admin', societeId: null, droits: [] },
      { id: 'RC', nom: 'collaborateur', societeId: null, droits: [] },
    ]);
    prisma.module.findMany.mockResolvedValue([
      { cle: 'crm', nom: 'CRM', etapes: [ETAPE] },
      { cle: 'vide', nom: 'Sans étape', etapes: [] },
    ]);
    const res = await s.matrice('S1');
    expect(res.modules).toEqual([
      { cle: 'crm', nom: 'CRM', etapes: [{ cle: 'crm', nom: 'Ensemble du module', libelles: ETAPE.libelles }] },
    ]);
    expect(res.roles).toEqual([
      { id: 'R1', nom: 'Dir. GC', transverse: false, carteBlanche: false, droits: { crm: droits('LE') } },
      { id: 'R2', nom: 'CIO', transverse: true, carteBlanche: true, droits: {} },
    ]);
  });
});

const un = (etapeCle: string, d: ReturnType<typeof droits>) => [{ roleId: 'R1', etapeCle, droits: d }];

describe('RolesService.enregistrer', () => {
  it('enregistre, trace, vide la mémoire des droits, avertit les titulaires et le CEO', async () => {
    const { svc: s, prisma, notifications, rights } = svc({ actuelle: { ...droits('L') } });
    await s.enregistrer('S1', un('crm', droits('LS')), 'CIO1');
    expect(prisma.roleRight.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: droits('LS'), create: { roleId: 'R1', etapeId: 'E-crm', ...droits('LS') } }),
    );
    expect(prisma.journalDroit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roleNom: 'Dir. GC',
        module: 'CRM',
        droitsAvant: 'L',
        droitsApres: 'LS',
        parId: 'CIO1',
      }),
    });
    expect(rights.invalidate).toHaveBeenCalled();
    expect(prisma.rightsNotice.createMany).toHaveBeenCalledWith({
      data: [
        { utilisateurId: 'U1', message: 'Vos droits ont changé · CRM : Suppression ajoutée' },
        { utilisateurId: 'U2', message: 'Vos droits ont changé · CRM : Suppression ajoutée' },
      ],
    });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'own_rights_changed', destinataireIds: ['U1'], societeId: 'S1' }),
    );
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'droits_modifies',
        destinataireIds: ['CEO1'],
        titre: 'Droits modifiés · Dir. GC · CRM : Suppression ajoutée · par Awa Diallo',
      }),
    );
  });

  it('plusieurs cases d’un coup : un seul avis par personne, qui les résume', async () => {
    const { svc: s, prisma } = svc({ affectations: [{ utilisateurId: 'U1', societeId: 'S1', roleId: 'R1' }] });
    prisma.moduleStep.findUnique
      .mockResolvedValueOnce(ETAPE)
      .mockResolvedValueOnce({ ...ETAPE, id: 'E-d', cle: 'crm.dossiers', nom: 'Dossiers et leads' });
    await s.enregistrer('S1', [...un('crm', droits('L')), ...un('crm.dossiers', droits('LE'))], 'CIO1');
    expect(prisma.rightsNotice.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.rightsNotice.createMany.mock.calls[0][0].data).toEqual([
      {
        utilisateurId: 'U1',
        message:
          'Vos droits ont changé · CRM : Lecture ajoutée ; CRM › Dossiers et leads : Lecture ajoutée, Écriture ajoutée',
      },
    ]);
  });

  it('cohérence : agir donne la lecture ; un droit sans objet n’est jamais accordé', async () => {
    const { svc: s, prisma } = svc();
    await s.enregistrer('S1', un('crm', { ...NO_RIGHTS, ecriture: true, validation: true }), 'CIO1');
    expect(prisma.roleRight.upsert.mock.calls[0][0]).toMatchObject({ update: droits('LE') });
  });

  it('rien ne change : ni écriture, ni avis', async () => {
    const { svc: s, prisma, notifications } = svc({ actuelle: droits('LE') });
    await s.enregistrer('S1', un('crm', droits('LE')), 'CIO1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.envoyer).not.toHaveBeenCalled();
  });

  it.each([
    ['le CIO (carte blanche)', { ...DIR_GC, nom: 'CIO (transverse)', societeId: null }],
    ['un compte d’administration', { ...DIR_GC, nom: 'societe_admin', societeId: null }],
    ['le rôle d’une autre société', { ...DIR_GC, societeId: 'S2' }],
  ])('refuse %s, sans rien écrire', async (_cas, role) => {
    const { svc: s, prisma } = svc({ role });
    await expect(s.enregistrer('S1', un('crm', droits('L')), 'CIO1')).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rôle ou étape introuvable → 404', async () => {
    await expect(svc({ etape: null }).svc.enregistrer('S1', un('x', droits('L')), 'CIO1')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      svc({ role: { ...DIR_GC, supprimeLe: new Date() } }).svc.enregistrer('S1', un('crm', droits('L')), 'CIO1'),
    ).rejects.toThrow(NotFoundException);
  });
});
