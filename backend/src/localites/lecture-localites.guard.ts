import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { aLaPermission } from '../commun/permission.guard';
import { SocieteAdminOuCioGuard } from '../commun/societe-admin-ou-cio.guard';

// Lire le référentiel : la direction qui le GÈRE (societe_admin ou CIO, même
// garde que l'écriture) OU quiconque crée des dossiers CRM (back-office +
// crm ≥ lecture — la liste déroulante du formulaire). L'écriture reste
// réservée au premier cas (cf. LocalitesController).
@Injectable()
export class LectureLocalitesGuard implements CanActivate {
  private gestion = new SocieteAdminOuCioGuard();
  private backOffice = new BackOfficeGuard();

  canActivate(ctx: ExecutionContext): boolean {
    try {
      return this.gestion.canActivate(ctx);
    } catch (refusGestion) {
      this.backOffice.canActivate(ctx); // 403 « réservé à la direction » sinon
      const user = ctx.switchToHttp().getRequest().user;
      if (aLaPermission(user.permissions, 'crm', 'lecture')) return true;
      throw refusGestion;
    }
  }
}
