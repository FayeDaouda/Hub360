import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { hacherJeton } from '../auth/jetons';
import { PrismaService } from '../prisma/prisma.service';
import { identifyCompany, runAsSystem } from '../tenancy/tenant-context';

// « <jeton>.ics » : 32 octets d'aléa en base64url (auth/jetons.ts).
const FICHIER = /^([A-Za-z0-9_-]{43})\.ics$/;

// Porte du lien d'abonnement (12/11/2026) — aucun JwtAuthGuard : le jeton EST
// l'authentification, comme le lien public d'un devis. Erreur uniforme (404),
// que le jeton soit absent, malformé ou inconnu. L'abonnement est recherché en
// périmètre système, puis la requête est limitée à sa société (ADR 0001).
@Injectable()
export class AbonnementAgendaGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const jeton = FICHIER.exec((req.params?.fichier as string | undefined) ?? '')?.[1];
    if (!jeton) throw new NotFoundException('Agenda introuvable');
    const abonnement = await runAsSystem('lien d’abonnement à un agenda', () =>
      this.prisma.abonnementAgenda.findUnique({
        where: { jetonHash: hacherJeton(jeton) },
        select: { id: true, societeId: true, utilisateurId: true, jetonHash: true, creeLe: true, dernierAccesLe: true },
      }),
    );
    if (!abonnement) throw new NotFoundException('Agenda introuvable');
    identifyCompany(abonnement.societeId);
    req.abonnementAgenda = abonnement;
    return true;
  }
}
