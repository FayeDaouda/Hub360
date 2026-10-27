import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemScope } from '../tenancy/tenant-scope.decorators';

// État de l'API pour la surveillance (contrôle de santé du conteneur, sonde
// de disponibilité externe, contrôle après déploiement) : 200 si la base
// répond, 503 sinon. Ne dit rien de plus.
@SystemScope('surveillance de la disponibilité, sans données')
@Controller('sante')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async etat(): Promise<{ statut: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Base de données indisponible.');
    }
    return { statut: 'ok' };
  }
}
