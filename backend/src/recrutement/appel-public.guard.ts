import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { identifyCompany, runAsSystem } from '../tenancy/tenant-context';

// Porte des pages publiques du recrutement (sans compte, 01/11/2026) : l'appel
// (`:slug`) ou la page Carrières (`:societe`) désigne une société, recherchée
// en périmètre système, puis la requête est limitée à cette société
// (ADR 0001). Erreur uniforme (404) — même philosophie que DevisPublicGuard.
@Injectable()
export class AppelPublicGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const params = ctx.switchToHttp().getRequest().params ?? {};
    const slug = typeof params.slug === 'string' ? params.slug : null;
    const societe = typeof params.societe === 'string' ? params.societe : null;
    const societeId = await runAsSystem('page publique du recrutement', async () => {
      if (slug) {
        const appel = await this.prisma.appelCandidature.findUnique({ where: { slug }, select: { societeId: true } });
        return appel?.societeId ?? null;
      }
      if (societe) {
        const s = await this.prisma.societe.findFirst({ where: { slug: societe, actif: true }, select: { id: true } });
        return s?.id ?? null;
      }
      return null;
    });
    if (!societeId) throw new NotFoundException('Page introuvable');
    identifyCompany(societeId);
    return true;
  }
}
