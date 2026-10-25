import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { hacherJeton } from '../auth/jetons';
import { ContratsService } from './contrats.service';
import { SignerContratDto } from './dto';
import { identifyCompany, runAsSystem } from '../tenancy/tenant-context';

// Porte du lien public d'un contrat — même principe que DevisPublicGuard :
// le jeton EST l'authentification, erreur uniforme (404) s'il ne correspond
// à rien.
@Injectable()
export class ContratPublicGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const token = ctx.switchToHttp().getRequest().params?.token as string | undefined;
    // Même principe que DevisPublicGuard : recherche du jeton en périmètre
    // système, puis requête limitée à la société du contrat (ADR 0001).
    const trouve = token
      ? await runAsSystem('lien public de contrat', () =>
          this.prisma.contrat.findFirst({
            where: { tokenPublicHash: hacherJeton(token) },
            select: { id: true, societeId: true },
          }),
        )
      : null;
    if (!trouve) throw new NotFoundException('Contrat introuvable');
    identifyCompany(trouve.societeId);
    return true;
  }
}

// Sans authentification — rate-limité comme le lien public des devis ;
// signer reste plus strictement borné.
@Controller('contrats-public')
@UseGuards(ThrottlerGuard, ContratPublicGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class ContratsPublicController {
  constructor(private contrats: ContratsService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.contrats.getPublic(token);
  }

  // `document` = le contrat sur mesure ; sinon l'id d'une annexe.
  @Get(':token/fichiers/:cible')
  fichier(@Param('token') token: string, @Param('cible') cible: string) {
    return this.contrats.fichierPublic(token, cible);
  }

  @Post(':token/signature')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signer(
    @Param('token') token: string,
    @Body() dto: SignerContratDto,
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> },
  ) {
    const transmis = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(transmis) ? transmis[0] : transmis)?.split(',')[0]?.trim() || req.ip || null;
    return this.contrats.signerPublic(token, dto, ip);
  }
}
