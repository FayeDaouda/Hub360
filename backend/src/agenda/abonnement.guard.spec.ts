import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { hacherJeton } from '../auth/jetons';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenant, runInRequestContext } from '../tenancy/tenant-context';
import { AbonnementAgendaGuard } from './abonnement.guard';

// Porte du lien d'abonnement à l'agenda (12/11/2026) : le jeton EST
// l'authentification. Absent, malformé ou inconnu : la même 404, sans
// distinction. Le vrai contexte d'isolation est utilisé (ADR 0001) pour
// vérifier que la requête est bien limitée à la société de l'abonnement.

const JETON = 'A'.repeat(21) + '_' + 'b'.repeat(20) + '-'; // 43 caractères base64url
const ctxOf = (req: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

const ABONNEMENT = { id: 'AB1', societeId: 'S1', utilisateurId: 'U1', dernierAccesLe: null };

function prisma(abonnement: typeof ABONNEMENT | null) {
  const findUnique = jest.fn().mockResolvedValue(abonnement);
  return { svc: { abonnementAgenda: { findUnique } } as unknown as PrismaService, findUnique };
}

// Exécute le guard dans le contexte d'une requête HTTP, comme le middleware.
const activer = (guard: AbonnementAgendaGuard, req: Record<string, unknown>) =>
  runInRequestContext(async () => {
    const ok = await guard.canActivate(ctxOf(req));
    return { ok, tenant: currentTenant() };
  });

describe('AbonnementAgendaGuard', () => {
  it('jeton valide : cherche par l’empreinte, limite la requête à la société et pose l’abonnement', async () => {
    const { svc, findUnique } = prisma(ABONNEMENT);
    const req: Record<string, unknown> = { params: { fichier: `${JETON}.ics` } };
    const { ok, tenant } = await activer(new AbonnementAgendaGuard(svc), req);
    expect(ok).toBe(true);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { jetonHash: hacherJeton(JETON) } }));
    // Le jeton en clair ne part jamais vers la base.
    expect(JSON.stringify(findUnique.mock.calls[0][0])).not.toContain(JETON);
    expect(tenant).toMatchObject({ scope: 'company', companyId: 'S1' });
    expect(req.abonnementAgenda).toEqual(ABONNEMENT);
  });

  it('la recherche de l’abonnement se fait en périmètre système, nommé', async () => {
    let perimetre: unknown;
    const findUnique = jest.fn().mockImplementation(async () => {
      perimetre = currentTenant();
      return ABONNEMENT;
    });
    const svc = { abonnementAgenda: { findUnique } } as unknown as PrismaService;
    await activer(new AbonnementAgendaGuard(svc), { params: { fichier: `${JETON}.ics` } });
    expect(perimetre).toMatchObject({ scope: 'system', reason: expect.any(String) });
  });

  it.each([
    ['absent', {}],
    ['vide', { fichier: '' }],
    ['sans l’extension .ics', { fichier: JETON }],
    ['trop court', { fichier: `${JETON.slice(1)}.ics` }],
    ['trop long', { fichier: `${JETON}x.ics` }],
    ['avec un caractère hors base64url', { fichier: `${JETON.slice(1)}=.ics` }],
    ['avec un chemin', { fichier: `../${JETON}.ics` }],
  ])('jeton %s : 404, sans requête en base', async (_cas, params) => {
    const { svc, findUnique } = prisma(ABONNEMENT);
    const req: Record<string, unknown> = { params };
    await expect(activer(new AbonnementAgendaGuard(svc), req)).rejects.toThrow(NotFoundException);
    expect(findUnique).not.toHaveBeenCalled();
    expect(req.abonnementAgenda).toBeUndefined();
  });

  it('requête sans params du tout : 404', async () => {
    const { svc } = prisma(ABONNEMENT);
    await expect(activer(new AbonnementAgendaGuard(svc), {})).rejects.toThrow(NotFoundException);
  });

  it('jeton bien formé mais inconnu : la même 404, société non identifiée', async () => {
    const { svc } = prisma(null);
    const req: Record<string, unknown> = { params: { fichier: `${JETON}.ics` } };
    let tenant: unknown;
    await expect(
      runInRequestContext(async () => {
        try {
          return await new AbonnementAgendaGuard(svc).canActivate(ctxOf(req));
        } finally {
          tenant = currentTenant();
        }
      }),
    ).rejects.toThrow(new NotFoundException('Agenda introuvable'));
    expect(tenant).toEqual({ scope: 'company' });
    expect(req.abonnementAgenda).toBeUndefined();
  });
});
