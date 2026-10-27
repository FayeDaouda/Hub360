import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SystemScope } from '../tenancy/tenant-scope.decorators';
import { ClientErrorDto } from './client-errors.dto';
import { ErrorReporter } from './error-reporter.service';

type R = { user: { userId: string; societeId: string } };

// Erreurs du navigateur d'un utilisateur connecté, suivies comme celles de
// l'API. Rien n'est lu ni écrit en base ; débit limité par utilisateur.
@SystemScope('suivi des erreurs du navigateur, sans accès aux données')
@Controller('erreurs-client')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class ClientErrorsController {
  constructor(private readonly reporter: ErrorReporter) {}

  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  signaler(@Req() req: R, @Body() dto: ClientErrorDto): void {
    this.reporter.report({
      source: 'navigateur',
      route: dto.page.split(/[?#]/)[0],
      userId: req.user.userId,
      companyId: req.user.societeId,
      message: dto.message,
      stack: dto.stack,
    });
  }
}
