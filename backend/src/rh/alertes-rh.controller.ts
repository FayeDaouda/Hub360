import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { AlertesRhService } from './alertes-rh.service';

// Échéances légales des dossiers (module « rh », lecture) : périmètre groupe.
@Controller('societes/:slug/rh/alertes')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class AlertesRhController {
  constructor(private alertes: AlertesRhService) {}

  @Get()
  @RequiertPermission('rh', 'lecture')
  lister() {
    return this.alertes.alertes();
  }
}
