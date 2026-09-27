import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccesCanalGuard } from './acces-canal.guard';

// Point de cloisonnement chat UNIQUE. Trois types de canal, chacun sa règle :
//   general → tout le monde (déjà garanti en amont par MembreSocieteGuard)
//   direct  → l'un des deux participants
//   cellule → membre de CETTE cellule, ou societe_admin (vue transverse) ;
//             un rôle de direction sans fiche n'a pas de cellule → refusé
// Plus le cas hors périmètre (canal d'une autre société → 404, jamais 403,
// pour ne pas révéler qu'un canal existe ailleurs).

type User = { societeId: string; userId: string; role: string };
type Canal = {
  type: 'general' | 'direct' | 'cellule';
  celluleId: string | null;
  participant1Id: string | null;
  participant2Id: string | null;
};

const USER: User = { societeId: 'S1', userId: 'U1', role: 'collaborateur' };

const ctxOf = (req: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

function prisma(opts: { canal?: Canal | null; collab?: { celluleId: string | null } | null }) {
  const canalFind = jest.fn().mockResolvedValue(opts.canal ?? null);
  const collabFind = jest.fn().mockResolvedValue(opts.collab ?? null);
  const svc = {
    canal: { findFirst: canalFind },
    collaborateur: { findFirst: collabFind },
  } as unknown as PrismaService;
  return { svc, canalFind, collabFind };
}

const req = (o: Partial<{ user: User; params: { id: string } }> = {}) => ({
  user: USER,
  params: { id: 'CANAL1' },
  ...o,
});

describe('AccesCanalGuard', () => {
  it('token absent → 403', async () => {
    const { svc } = prisma({});
    await expect(
      new AccesCanalGuard(svc).canActivate(ctxOf(req({ user: undefined }))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('HORS PÉRIMÈTRE : canal inexistant dans SA société → 404, et le where porte le societeId', async () => {
    const { svc, canalFind } = prisma({ canal: null });
    await expect(
      new AccesCanalGuard(svc).canActivate(ctxOf(req())),
    ).rejects.toThrow(NotFoundException);
    expect(canalFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'CANAL1', societeId: 'S1' }),
      }),
    );
  });

  describe('canal general', () => {
    it('AUTORISÉ : tout membre, sans requête collaborateur', async () => {
      const { svc, collabFind } = prisma({
        canal: { type: 'general', celluleId: null, participant1Id: null, participant2Id: null },
      });
      await expect(
        new AccesCanalGuard(svc).canActivate(ctxOf(req())),
      ).resolves.toBe(true);
      expect(collabFind).not.toHaveBeenCalled();
    });
  });

  describe('canal direct', () => {
    it('AUTORISÉ : premier participant', async () => {
      const { svc } = prisma({
        canal: { type: 'direct', celluleId: null, participant1Id: 'U1', participant2Id: 'U2' },
      });
      await expect(
        new AccesCanalGuard(svc).canActivate(ctxOf(req())),
      ).resolves.toBe(true);
    });

    it('AUTORISÉ : second participant', async () => {
      const { svc } = prisma({
        canal: { type: 'direct', celluleId: null, participant1Id: 'U2', participant2Id: 'U1' },
      });
      await expect(
        new AccesCanalGuard(svc).canActivate(ctxOf(req())),
      ).resolves.toBe(true);
    });

    it('REFUSÉ DANS LE PÉRIMÈTRE : ni l’un ni l’autre participant → 403', async () => {
      const { svc } = prisma({
        canal: { type: 'direct', celluleId: null, participant1Id: 'U2', participant2Id: 'U3' },
      });
      await expect(
        new AccesCanalGuard(svc).canActivate(ctxOf(req())),
      ).rejects.toThrow(/n'est pas la vôtre/);
    });
  });

  describe('canal cellule', () => {
    it('AUTORISÉ : societe_admin, sans requête collaborateur', async () => {
      const { svc, collabFind } = prisma({
        canal: { type: 'cellule', celluleId: 'CEL1', participant1Id: null, participant2Id: null },
      });
      await expect(
        new AccesCanalGuard(svc).canActivate(
          ctxOf(req({ user: { ...USER, role: 'societe_admin' } })),
        ),
      ).resolves.toBe(true);
      expect(collabFind).not.toHaveBeenCalled();
    });

    it('AUTORISÉ : collaborateur de la même cellule', async () => {
      const { svc } = prisma({
        canal: { type: 'cellule', celluleId: 'CEL1', participant1Id: null, participant2Id: null },
        collab: { celluleId: 'CEL1' },
      });
      await expect(
        new AccesCanalGuard(svc).canActivate(ctxOf(req())),
      ).resolves.toBe(true);
    });

    it('REFUSÉ DANS LE PÉRIMÈTRE : collaborateur d’une autre cellule → 403', async () => {
      const { svc } = prisma({
        canal: { type: 'cellule', celluleId: 'CEL1', participant1Id: null, participant2Id: null },
        collab: { celluleId: 'CEL2' },
      });
      await expect(
        new AccesCanalGuard(svc).canActivate(ctxOf(req())),
      ).rejects.toThrow(/n'est pas celui de votre cellule/);
    });

    it('REFUSÉ : rôle de direction sans fiche (pas de cellule) → 403 cellule', async () => {
      const { svc } = prisma({
        canal: { type: 'cellule', celluleId: 'CEL1', participant1Id: null, participant2Id: null },
        collab: null,
      });
      await expect(
        new AccesCanalGuard(svc).canActivate(ctxOf(req({ user: { ...USER, role: 'CFO' } }))),
      ).rejects.toThrow(/n'est pas celui de votre cellule/);
    });

    it('AUTORISÉ : rôle de direction qui a aussi une fiche dans CETTE cellule', async () => {
      const { svc } = prisma({
        canal: { type: 'cellule', celluleId: 'CEL1', participant1Id: null, participant2Id: null },
        collab: { celluleId: 'CEL1' },
      });
      await expect(
        new AccesCanalGuard(svc).canActivate(ctxOf(req({ user: { ...USER, role: 'Dir. GC' } }))),
      ).resolves.toBe(true);
    });

    it('compte collaborateur sans fiche → 403', async () => {
      const { svc } = prisma({
        canal: { type: 'cellule', celluleId: 'CEL1', participant1Id: null, participant2Id: null },
        collab: null,
      });
      await expect(
        new AccesCanalGuard(svc).canActivate(ctxOf(req())),
      ).rejects.toThrow(/Aucune fiche/);
    });
  });
});
