import { Injectable } from '@nestjs/common';
import { ALL_RIGHTS, encodeRights, ROLE_CIO } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { SwitchesService } from '../switches/switches.service';

// Lus à chaque requête (JwtStrategy) : gardés quelques secondes en mémoire
// (une seule instance de l'API, comme les interrupteurs), vidés à chaque
// changement de la matrice — le changement vaut donc dès la requête suivante.
const CACHE_MS = 30_000;
type Cached<T> = { at: number; value: T };

export type RightsMap = Record<string, string>; // clé d'étape → lettres « LEVS »

// Carte blanche (décision du 31/10/2026) : l'Administrateur HUB et le CIO ont
// les quatre droits sur toutes les étapes, et passent les interrupteurs.
export const hasFullAccess = (u: { adminHub?: boolean; role?: string }) => !!u.adminHub || u.role === ROLE_CIO;

// Droits effectifs d'une personne : ceux de son rôle dans la matrice, moins
// les modules coupés pour sa société. Seule source pour la session (jeton
// rendu à l'écran) et pour les gardes (relus à chaque requête).
@Injectable()
export class RightsService {
  private roleOfUser = new Map<string, Cached<string | null>>();
  private rightsOfRole = new Map<string, Cached<RightsMap>>();
  private steps: Cached<{ cle: string; moduleCle: string }[]> | null = null;

  constructor(
    private prisma: PrismaService,
    private switches: SwitchesService,
  ) {}

  // Vidé par la matrice (RolesService) et par un changement de rôle d'un compte.
  invalidate() {
    this.roleOfUser.clear();
    this.rightsOfRole.clear();
    this.steps = null;
  }

  async forUser(u: { userId: string; societeId: string | null; role: string; adminHub?: boolean }): Promise<RightsMap> {
    if (hasFullAccess(u)) return this.full();
    if (!u.societeId) return {};
    const roleId = await this.roleId(u.userId, u.societeId, u.role);
    return roleId ? this.forRole(roleId, u.societeId) : {};
  }

  // Droits d'un rôle donné, interrupteurs de la société appliqués.
  async forRole(roleId: string, societeId: string): Promise<RightsMap> {
    const [rights, disabled, steps] = await Promise.all([
      this.matrixRow(roleId),
      this.switches.disabledModules(societeId),
      this.allSteps(),
    ]);
    if (!disabled.size) return rights;
    const moduleOf = new Map(steps.map((s) => [s.cle, s.moduleCle]));
    return Object.fromEntries(Object.entries(rights).filter(([step]) => !disabled.has(moduleOf.get(step) ?? step)));
  }

  async full(): Promise<RightsMap> {
    const all = encodeRights(ALL_RIGHTS);
    return Object.fromEntries((await this.allSteps()).map((s) => [s.cle, all]));
  }

  // Rôle de la personne dans la société : son affectation dans la société,
  // sinon son affectation transverse (même règle que la connexion). Le nom du
  // rôle porté par le jeton entre dans la clé : après un changement de rôle,
  // le nouveau jeton ne retrouve jamais l'ancien rôle en mémoire.
  private async roleId(userId: string, societeId: string, roleNom: string): Promise<string | null> {
    const key = `${userId}:${societeId}:${roleNom}`;
    const hit = this.roleOfUser.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const rows = await this.prisma.utilisateurSocieteRole.findMany({
      where: { utilisateurId: userId, OR: [{ societeId }, { societeId: null }], role: { supprimeLe: null } },
      select: { societeId: true, roleId: true },
    });
    const value =
      (rows.find((r) => r.societeId === societeId) ?? rows.find((r) => r.societeId === null))?.roleId ?? null;
    this.roleOfUser.set(key, { at: Date.now(), value });
    return value;
  }

  private async matrixRow(roleId: string): Promise<RightsMap> {
    const hit = this.rightsOfRole.get(roleId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const rows = await this.prisma.roleRight.findMany({
      where: { roleId },
      select: { lecture: true, ecriture: true, validation: true, suppression: true, etape: { select: { cle: true } } },
    });
    const value: RightsMap = {};
    for (const { etape, ...rights } of rows) {
      const letters = encodeRights(rights);
      if (letters) value[etape.cle] = letters;
    }
    this.rightsOfRole.set(roleId, { at: Date.now(), value });
    return value;
  }

  private async allSteps() {
    if (this.steps && Date.now() - this.steps.at < CACHE_MS) return this.steps.value;
    const rows = await this.prisma.moduleStep.findMany({ select: { cle: true, module: { select: { cle: true } } } });
    const value = rows.map((r) => ({ cle: r.cle, moduleCle: r.module.cle }));
    this.steps = { at: Date.now(), value };
    return value;
  }
}
