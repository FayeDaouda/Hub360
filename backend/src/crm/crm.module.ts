import { Module } from '@nestjs/common';
import { DevisModule } from '../devis/devis.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjetsModule } from '../projets/projets.module';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';

// DevisModule : l'offre d'un dossier est un devis, envoyé par la validation
// DAF du cycle (CrmService.agir → DevisService.emettreOffre). ProjetsModule :
// à l'Onboard, l'offre acceptée devient les factures du projet
// (FacturationService.preparerDepuisOffre, étape H2).
@Module({
  imports: [DevisModule, ProjetsModule, NotificationsModule],
  providers: [CrmService],
  controllers: [CrmController],
  // Le contrat (étape G) déclenche l'Onboard par CrmService.
  exports: [CrmService],
})
export class CrmModule {}
