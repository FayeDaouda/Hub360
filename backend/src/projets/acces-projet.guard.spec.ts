import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { AccesProjetGuard } from './acces-projet.guard';

// Point de cloisonnement projet UNIQUE. On teste systématiquement les trois
// axes : autorisé / refusé dans le périmètre (bon rôle, mauvaise ressource) /
// hors périmètre (ressource d'une autre société) — plus le garde-fou de la
// liste blanche @EcritureCollaborateur (un endpoint non marqué doit rester
// fermé au collaborateur, même par oubli du dev).

type User = {
  societeId: string;
  societeSlug: string | null;
  userId: string;
  role: string;
};
type Req = { user?: User; params: { slug?: string; id?: string }; method: string };

const COLLAB: User = {
  societeId: 'S1',
  societeSlug: 'grey',
  userId: 'U1',
  role: 'collaborateur',
};

const ctxOf = (req: Req): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  }) as unknown as ExecutionContext;

// Réutilisé pour les deux clés de métadonnées que le guard interroge :
// ECRITURE_COLLABORATEUR (booléen) et PERMISSION_REQUISE ({module, niveau}).
const reflector = (valeur: boolean | { module: string; niveau: string } | undefined): Reflector =>
  ({ getAllAndOverride: jest.fn().mockReturnValue(valeur) }) as unknown as Reflector;

function prisma(opts: { collab?: unknown; projet?: unknown } = {}) {
  const collabFind = jest.fn().mockResolvedValue(opts.collab ?? null);
  const projetFind = jest.fn().mockResolvedValue(opts.projet ?? null);
  const svc = {
    collaborateur: { findFirst: collabFind },
    projet: { findFirst: projetFind },
  } as unknown as PrismaService;
  return { svc, collabFind, projetFind };
}

const req = (o: Partial<Req> = {}): Req => ({
  user: COLLAB,
  params: { slug: 'grey', id: 'P1' },
  method: 'GET',
  ...o,
});

describe('AccesProjetGuard', () => {
  describe('rôle & société', () => {
    it('societe_admin : accès plein, sans toucher la base', async () => {
      const { svc, collabFind, projetFind } = prisma();
      const g = new AccesProjetGuard(svc, reflector(undefined));
      await expect(
        g.canActivate(
          ctxOf(req({ user: { ...COLLAB, role: 'societe_admin' }, method: 'DELETE' })),
        ),
      ).resolves.toBe(true);
      expect(collabFind).not.toHaveBeenCalled();
      expect(projetFind).not.toHaveBeenCalled();
    });

    it('HORS PÉRIMÈTRE : token émis pour une autre société → 403', async () => {
      const g = new AccesProjetGuard(prisma().svc, reflector(undefined));
      await expect(
        g.canActivate(ctxOf(req({ user: { ...COLLAB, societeSlug: 'autre' } }))),
      ).rejects.toThrow(ForbiddenException);
    });

    it('token absent → 403', async () => {
      const g = new AccesProjetGuard(prisma().svc, reflector(undefined));
      await expect(
        g.canActivate(ctxOf(req({ user: undefined }))),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rôle ni admin ni collaborateur → 403', async () => {
      const g = new AccesProjetGuard(prisma().svc, reflector(undefined));
      await expect(
        g.canActivate(ctxOf(req({ user: { ...COLLAB, role: 'holding_admin' } }))),
      ).rejects.toThrow(/non autorisé/);
    });

    it('rôle métier (CFO) sur un endpoint @RequiertPermission : laissé passer, sans toucher la base — PermissionGuard tranche le niveau', async () => {
      const { svc, collabFind, projetFind } = prisma();
      const g = new AccesProjetGuard(
        svc,
        reflector({ module: 'finances_marges', niveau: 'lecture' }),
      );
      await expect(
        g.canActivate(ctxOf(req({ user: { ...COLLAB, role: 'CFO' } }))),
      ).resolves.toBe(true);
      expect(collabFind).not.toHaveBeenCalled();
      expect(projetFind).not.toHaveBeenCalled();
    });

    it('rôle métier (CFO) sur un endpoint NON marqué @RequiertPermission → 403 (pas d’accès implicite)', async () => {
      const g = new AccesProjetGuard(prisma().svc, reflector(undefined));
      await expect(
        g.canActivate(ctxOf(req({ user: { ...COLLAB, role: 'CFO' } }))),
      ).rejects.toThrow(/non autorisé/);
    });
  });

  describe('collaborateur — lecture', () => {
    it('AUTORISÉ : projet suivi par sa cellule', async () => {
      const { svc } = prisma({
        collab: { id: 'C1', celluleId: 'CEL1' },
        projet: { cellules: [{ celluleId: 'CEL1' }], avantProjet: null },
      });
      await expect(
        new AccesProjetGuard(svc, reflector(undefined)).canActivate(ctxOf(req())),
      ).resolves.toBe(true);
    });

    it('AUTORISÉ : projet suivi par plusieurs cellules dont la sienne', async () => {
      const { svc } = prisma({
        collab: { id: 'C1', celluleId: 'CEL1' },
        projet: {
          cellules: [{ celluleId: 'CEL2' }, { celluleId: 'CEL1' }],
          avantProjet: null,
        },
      });
      await expect(
        new AccesProjetGuard(svc, reflector(undefined)).canActivate(ctxOf(req())),
      ).resolves.toBe(true);
    });

    it('AUTORISÉ : projet dont il est dessinateur (autre cellule)', async () => {
      const { svc } = prisma({
        collab: { id: 'C1', celluleId: 'CEL1' },
        projet: {
          cellules: [{ celluleId: 'CEL2' }],
          avantProjet: { dessinateurId: 'C1', responsable3dId: null },
        },
      });
      await expect(
        new AccesProjetGuard(svc, reflector(undefined)).canActivate(ctxOf(req())),
      ).resolves.toBe(true);
    });

    it('REFUSÉ DANS LE PÉRIMÈTRE : bon rôle, projet d’une autre cellule → 403', async () => {
      const { svc } = prisma({
        collab: { id: 'C1', celluleId: 'CEL1' },
        projet: {
          cellules: [{ celluleId: 'CEL2' }],
          avantProjet: { dessinateurId: 'CX', responsable3dId: 'CY' },
        },
      });
      await expect(
        new AccesProjetGuard(svc, reflector(undefined)).canActivate(ctxOf(req())),
      ).rejects.toThrow(/pas suivi par votre cellule/);
    });

    it('HORS PÉRIMÈTRE : projet inexistant dans SA société → 404, et le where porte le societeId', async () => {
      const { svc, projetFind } = prisma({
        collab: { id: 'C1', celluleId: 'CEL1' },
        projet: null,
      });
      await expect(
        new AccesProjetGuard(svc, reflector(undefined)).canActivate(ctxOf(req())),
      ).rejects.toThrow(NotFoundException);
      expect(projetFind).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'P1', societeId: 'S1' }),
        }),
      );
    });

    it('compte collaborateur sans fiche → 403', async () => {
      const { svc } = prisma({ collab: null });
      await expect(
        new AccesProjetGuard(svc, reflector(undefined)).canActivate(ctxOf(req())),
      ).rejects.toThrow(/Aucune fiche/);
    });

    it('GET liste (pas de :id) : laissé passer, le service restreint', async () => {
      const { svc, collabFind } = prisma();
      await expect(
        new AccesProjetGuard(svc, reflector(undefined)).canActivate(
          ctxOf(req({ params: { slug: 'grey' } })),
        ),
      ).resolves.toBe(true);
      expect(collabFind).not.toHaveBeenCalled();
    });
  });

  describe('collaborateur — écriture / liste blanche @EcritureCollaborateur', () => {
    it('endpoint NON marqué → 403 (protège contre un futur endpoint ajouté sans y penser)', async () => {
      const { svc, collabFind } = prisma({
        collab: { id: 'C1', celluleId: 'CEL1' },
        projet: { cellules: [{ celluleId: 'CEL1' }], avantProjet: null },
      });
      await expect(
        new AccesProjetGuard(svc, reflector(undefined)).canActivate(
          ctxOf(req({ method: 'PATCH' })),
        ),
      ).rejects.toThrow(/réservée à l'administration/);
      expect(collabFind).not.toHaveBeenCalled(); // rejeté avant toute vérif de périmètre
    });

    it('endpoint marqué + projet à lui → AUTORISÉ', async () => {
      const { svc } = prisma({
        collab: { id: 'C1', celluleId: 'CEL1' },
        projet: { cellules: [{ celluleId: 'CEL1' }], avantProjet: null },
      });
      await expect(
        new AccesProjetGuard(svc, reflector(true)).canActivate(
          ctxOf(req({ method: 'PATCH' })),
        ),
      ).resolves.toBe(true);
    });

    it('endpoint marqué mais projet PAS à lui → 403 (le périmètre s’applique quand même)', async () => {
      const { svc } = prisma({
        collab: { id: 'C1', celluleId: 'CEL1' },
        projet: { cellules: [{ celluleId: 'CEL2' }], avantProjet: null },
      });
      await expect(
        new AccesProjetGuard(svc, reflector(true)).canActivate(
          ctxOf(req({ method: 'PATCH' })),
        ),
      ).rejects.toThrow(/pas suivi par votre cellule/);
    });

    it('écriture marquée mais sans :id cible → 403', async () => {
      const { svc } = prisma();
      await expect(
        new AccesProjetGuard(svc, reflector(true)).canActivate(
          ctxOf(req({ method: 'POST', params: { slug: 'grey' } })),
        ),
      ).rejects.toThrow(/sans projet cible/);
    });
  });
});

describe('AccesProjetGuard — contrôleurs sous @PermissionSelonMethode', () => {
  const parCle = (valeurs: Record<string, unknown>): Reflector =>
    ({ getAllAndOverride: jest.fn((cle: string) => valeurs[cle]) }) as unknown as Reflector;

  it('rôle de direction (Dir. GC) : laissé passer sans filtre de cellule ni lecture de la base — PermissionGuard tranche', async () => {
    const { svc, collabFind, projetFind } = prisma();
    const g = new AccesProjetGuard(svc, parCle({ permissionSelonMethode: { module: 'projets', roleHorsMatrice: 'collaborateur' } }));
    await expect(
      g.canActivate(ctxOf(req({ user: { ...COLLAB, role: 'Dir. GC' } }))),
    ).resolves.toBe(true);
    expect(collabFind).not.toHaveBeenCalled();
    expect(projetFind).not.toHaveBeenCalled();
  });

  it.each([['GET'], ['PATCH']])(
    'Salarié : anciennes routes fermées (%s), même sur un contrôleur ouvert à la matrice',
    async (method) => {
      const { svc, projetFind } = prisma();
      const g = new AccesProjetGuard(svc, parCle({ permissionSelonMethode: { module: 'projets', roleHorsMatrice: 'collaborateur' } }));
      await expect(
        g.canActivate(ctxOf(req({ method, user: { ...COLLAB, role: 'Salarié' } }))),
      ).rejects.toThrow(ForbiddenException);
      expect(projetFind).not.toHaveBeenCalled();
    },
  );

  it('collaborateur : son chemin par cellule est inchangé (projet d’une autre cellule → 403)', async () => {
    const { svc } = prisma({
      collab: { id: 'C1', celluleId: 'CEL-A' },
      projet: { cellules: [{ celluleId: 'CEL-B' }], avantProjet: null },
    });
    const g = new AccesProjetGuard(svc, parCle({ permissionSelonMethode: { module: 'projets', roleHorsMatrice: 'collaborateur' } }));
    await expect(g.canActivate(ctxOf(req()))).rejects.toThrow(ForbiddenException);
  });
});
