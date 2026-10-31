import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DroitsCourantsDto, RightsNoticeDto } from './rights.dto';

type R = { user: { userId: string; permissions: Record<string, string> } };

// Avis « Vos droits ont changé » de la personne connectée : affichés en haut
// de page tant qu'elle n'a pas cliqué « J'ai compris » — dès le changement si
// elle est connectée (l'écran les sonde), à sa prochaine visite sinon.
@Controller('auth/moi')
@UseGuards(JwtAuthGuard)
export class RightsNoticesController {
  constructor(private prisma: PrismaService) {}

  // Droits du moment (relus par JwtStrategy), sans nouveau jeton : l'écran
  // se met à jour sans prolonger la session d'une personne inactive.
  @Get('droits')
  droits(@Req() req: R): DroitsCourantsDto {
    return { permissions: req.user.permissions };
  }

  @Get('avis-droits')
  lister(@Req() req: R): Promise<RightsNoticeDto[]> {
    return this.prisma.rightsNotice.findMany({
      where: { utilisateurId: req.user.userId, comprisLe: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { id: true, message: true, createdAt: true },
    });
  }

  @Post('avis-droits/compris')
  @HttpCode(204)
  async compris(@Req() req: R): Promise<void> {
    await this.prisma.rightsNotice.updateMany({
      where: { utilisateurId: req.user.userId, comprisLe: null },
      data: { comprisLe: new Date() },
    });
  }
}
