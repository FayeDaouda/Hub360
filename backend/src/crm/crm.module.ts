import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DevisModule } from '../devis/devis.module';
import { FinancesModule } from '../finances/finances.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjetsModule } from '../projets/projets.module';
import { CommercialService } from './commercial.service';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';

// DevisModule : l'offre d'un dossier est un devis, envoyé par la validation
// DAF du cycle (CrmService.agir → DevisService.emettreOffre). ProjetsModule :
// à l'Onboard, l'offre acceptée devient les factures du projet
// (FacturationService.preparerDepuisOffre, étape H2).
@Module({
  imports: [DevisModule, ProjetsModule, NotificationsModule, FinancesModule, AuthModule],
  providers: [CrmService, CommercialService, CommissionsService],
  controllers: [CrmController, CommissionsController],
  // Le contrat (étape G) déclenche l'Onboard par CrmService.
  exports: [CrmService],
})
export class CrmModule {}
