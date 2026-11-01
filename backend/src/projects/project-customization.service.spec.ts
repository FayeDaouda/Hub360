import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ProjectCustomizationService } from './project-customization.service';

// Personnalisation d'un projet (01/11/2026).
describe('ProjectCustomizationService', () => {
  const direction = { userId: 'U1', role: 'Dir. GC', permissions: { 'projets.personnalisation': 'LE' } };
  const setup = (task: object = {}) => {
    const tx = {
      tacheProjet: { create: jest.fn().mockResolvedValue({ id: 'T9', libelle: 'Attestation' }) },
      modificationProjet: { create: jest.fn() },
    };
    const prisma = {
      carteProjet: {
        findFirst: jest.fn().mockImplementation(({ where }) =>
          where.ouvreApres
            ? null
            : {
                id: 'C1',
                libelle: 'Documents du client',
                fichiers: false,
                desactivation: null,
                taches: [{ cle: 'ninea', libelle: 'NINEA', ordre: 1 }],
                projet: { ouvertLe: '2026-11-02' },
              },
        ),
      },
      tacheProjet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'T1',
          carteId: 'C1',
          cle: 'ninea',
          libelle: 'NINEA',
          statut: 'a_faire',
          version: 0,
          devisTsId: null,
          debutJ: null,
          finJ: null,
          heures: null,
          visaRequis: false,
          fichierObligatoire: true,
          descriptif: null,
          carte: { cle: 'documents_client', libelle: 'Documents du client' },
          projet: { ouvertLe: '2026-11-02' },
          ...task,
        }),
        count: jest.fn().mockResolvedValue(3),
        delete: jest.fn().mockReturnValue('delete'),
        update: jest.fn().mockReturnValue('update'),
      },
      modificationProjet: { create: jest.fn().mockReturnValue('log') },
      $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? arg(tx) : Promise.all(arg as unknown[]))),
    };
    const states = { holidays: jest.fn().mockResolvedValue(new Set<string>()) };
    return { s: new ProjectCustomizationService(prisma as never, states as never), prisma, tx };
  };

  it('sans l’Écriture de « Personnalisation du projet » : refusé', async () => {
    await expect(
      setup().s.addLine('S1', { ...direction, permissions: {} }, 'P1', 'C1', { libelle: 'Attestation' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ajoute une ligne au projet : clé p_, dates depuis J1, marquée « ajoutée », tracée au journal', async () => {
    const { s, tx } = setup();
    await s.addLine('S1', direction, 'P1', 'C1', {
      libelle: 'Attestation de propriété',
      debutJ: 1,
      finJ: 2,
      heures: 2,
    });
    const data = tx.tacheProjet.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      cle: 'p_attestation_de_propriete',
      ordre: 2,
      debutLe: '2026-11-02',
      finLe: '2026-11-03',
      heures: 2,
      ajouteeAuProjet: true,
    });
    expect(tx.modificationProjet.create.mock.calls[0][0].data.libelle).toBe(
      'Documents du client · Attestation de propriété — ligne ajoutée (J1 → J2, 2 h)',
    );
  });

  it('retire une ligne jamais remise ; refuse une ligne déjà remise et une ligne qui ouvre une carte', async () => {
    const ok = setup();
    await ok.s.removeLine('S1', direction, 'P1', 'T1');
    expect(ok.prisma.tacheProjet.delete).toHaveBeenCalledWith({ where: { id: 'T1' } });
    await expect(setup({ version: 1, statut: 'a_valider' }).s.removeLine('S1', direction, 'P1', 'T1')).rejects.toThrow(
      'marquez-la « Non nécessaire »',
    );
    const cond = setup();
    cond.prisma.carteProjet.findFirst.mockResolvedValueOnce({ libelle: 'Détails façade' });
    await expect(cond.s.removeLine('S1', direction, 'P1', 'T1')).rejects.toThrow(ConflictException);
  });

  it('modifie une ligne et trace l’avant → après ; pas de fenêtre ni de temps sur une ligne validée', async () => {
    const { s, prisma } = setup();
    // Recherche d'un doublon d'intitulé : aucun.
    const tache = await prisma.tacheProjet.findFirst({ where: {} });
    prisma.tacheProjet.findFirst.mockImplementation(({ where }) => Promise.resolve(where.libelle ? null : tache));
    await s.updateLine('S1', direction, 'P1', 'T1', { libelle: 'NINEA (entreprise)', heures: 1 });
    expect(prisma.modificationProjet.create.mock.calls[0][0].data.libelle).toBe(
      'Documents du client · NINEA — intitulé : « NINEA » → « NINEA (entreprise) », temps : sans temps atelier → 1 h',
    );
    await expect(setup({ statut: 'validee' }).s.updateLine('S1', direction, 'P1', 'T1', { heures: 4 })).rejects.toThrow(
      'son temps ne change plus',
    );
  });
});
