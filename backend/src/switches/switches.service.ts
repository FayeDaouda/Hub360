import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { InterrupteursDto } from './switches.dto';

// Lus à chaque requête (garde des permissions, session) : gardés quelques
// secondes en mémoire (une seule instance de l'API), vidés à chaque bascule.
const CACHE_MS = 10_000;
type Cached<T> = { at: number; value: T };

const MAINTENANCE_MESSAGE = 'Le HUB est en maintenance. Réessayez plus tard.';

// Interrupteurs de l'Administrateur HUB (lot 4, 29/10/2026) : modules de la
// matrice coupés par société, et mode maintenance du HUB entier.
@Injectable()
export class SwitchesService {
  private disabled = new Map<string, Cached<Set<string>>>();
  private maintenanceCache: Cached<{ actif: boolean; message: string }> | null = null;

  constructor(private prisma: PrismaService) {}

  async disabledModules(companyId: string): Promise<Set<string>> {
    const hit = this.disabled.get(companyId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const rows = await this.prisma.moduleDesactive.findMany({
      where: { societeId: companyId },
      select: { moduleCle: true },
    });
    const value = new Set(rows.map((r) => r.moduleCle));
    this.disabled.set(companyId, { at: Date.now(), value });
    return value;
  }

  async maintenance(): Promise<{ actif: boolean; message: string }> {
    if (this.maintenanceCache && Date.now() - this.maintenanceCache.at < CACHE_MS) return this.maintenanceCache.value;
    const row = await this.prisma.maintenanceHub.findUnique({ where: { id: 'hub' } });
    const value = { actif: !!row?.actif, message: row?.message ?? '' };
    this.maintenanceCache = { at: Date.now(), value };
    return value;
  }

  // Refus pendant la maintenance (connexion, requêtes), sauf la carte blanche
  // (Administrateur HUB, CIO).
  async refuseDuringMaintenance(fullAccess: boolean) {
    if (fullAccess) return;
    const m = await this.maintenance();
    if (m.actif) throw new ServiceUnavailableException(m.message.trim() || MAINTENANCE_MESSAGE);
  }

  async state(companyId: string): Promise<InterrupteursDto> {
    const [modules, disabled, maintenance] = await Promise.all([
      this.prisma.module.findMany({ orderBy: { nom: 'asc' }, select: { cle: true, nom: true } }),
      this.prisma.moduleDesactive.findMany({ where: { societeId: companyId } }),
      this.prisma.maintenanceHub.findUnique({ where: { id: 'hub' } }),
    ]);
    const byKey = new Map(disabled.map((d) => [d.moduleCle, d]));
    return {
      modules: modules.map((m) => {
        const d = byKey.get(m.cle);
        return { cle: m.cle, nom: m.nom, actif: !d, desactiveLe: d?.createdAt ?? null, motif: d?.motif ?? null };
      }),
      maintenance: {
        actif: !!maintenance?.actif,
        message: maintenance?.message ?? '',
        depuis: maintenance ? { le: maintenance.modifieLe, par: await this.auteur(maintenance.parId) } : null,
      },
    };
  }

  // Auteur de la dernière bascule de maintenance, nommé comme au journal
  // d'audit. La maintenance vaut pour tout le HUB : sa trace ne se lit pas
  // dans le journal d'une société (elle est inscrite dans celui de la société
  // de connexion de l'auteur).
  private async auteur(parId: string | null): Promise<string | null> {
    if (!parId) return null;
    const u = await this.prisma.utilisateur.findUnique({ where: { id: parId }, select: { prenom: true, nom: true } });
    return u ? `${u.prenom} ${u.nom}`.trim() : 'compte supprimé';
  }

  async setModule(companyId: string, moduleKey: string, active: boolean, motif: string, actorId: string) {
    const module = await this.prisma.module.findUnique({ where: { cle: moduleKey }, select: { nom: true } });
    if (!module) throw new NotFoundException('Module introuvable.');
    const current = await this.prisma.moduleDesactive.findUnique({
      where: { societeId_moduleCle: { societeId: companyId, moduleCle: moduleKey } },
    });
    if (!current === active) return this.state(companyId);
    await this.prisma.$transaction([
      active
        ? this.prisma.moduleDesactive.delete({
            where: { societeId_moduleCle: { societeId: companyId, moduleCle: moduleKey } },
          })
        : this.prisma.moduleDesactive.create({
            data: { societeId: companyId, moduleCle: moduleKey, motif, parId: actorId },
          }),
      this.prisma.interventionHub.create({
        data: {
          societeId: companyId,
          parId: actorId,
          type: active ? 'module_reactive' : 'module_desactive',
          cible: moduleKey,
          detail: `${module.nom} ${active ? 'réactivé' : 'désactivé'}`,
          motif,
        },
      }),
    ]);
    this.disabled.delete(companyId);
    return this.state(companyId);
  }

  // Le HUB entier ; l'intervention est inscrite au journal de la société de
  // connexion de l'Administrateur HUB.
  async setMaintenance(companyId: string, active: boolean, message: string, motif: string, actorId: string) {
    // Déjà dans cet état (deux administrateurs en même temps) : rien n'est
    // écrit, ni la ligne (sa trace « par … le … » reste celle de la vraie
    // bascule) ni une intervention au journal qui n'en serait pas une.
    const current = await this.prisma.maintenanceHub.findUnique({ where: { id: 'hub' } });
    if (!!current?.actif === active) return this.state(companyId);
    await this.prisma.$transaction([
      this.prisma.maintenanceHub.upsert({
        where: { id: 'hub' },
        create: { id: 'hub', actif: active, message, parId: actorId },
        update: { actif: active, message, parId: actorId },
      }),
      this.prisma.interventionHub.create({
        data: {
          societeId: companyId,
          parId: actorId,
          type: active ? 'maintenance_activee' : 'maintenance_levee',
          cible: 'HUB',
          detail: active ? `Maintenance${message.trim() ? ` : « ${message.trim()} »` : ''}` : 'HUB rouvert',
          motif,
        },
      }),
    ]);
    this.maintenanceCache = null;
    return this.state(companyId);
  }
}
