import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { ClientsService } from './clients.service';
import { ETAPE } from '../rights/catalogue';

// La liste des clients sert le CRM (choix du client d'un dossier) : même
// niveau que la consultation du CRM.
@Controller('societes/:slug/clients')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class ClientsController {
  constructor(private clients: ClientsService) {}

  @Get()
  @RequiertPermission(ETAPE.crmDossiers, 'lecture')
  findAll(@Req() req: { user: { societeId: string } }) {
    return this.clients.findAll(req.user.societeId);
  }
}
