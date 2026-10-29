import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { ProjetsModule } from '../projets/projets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OnboardingModule } from '../crm/onboarding.module';
import { AvenantsTsController } from './avenants-ts.controller';
import { AvenantsTsService } from './avenants-ts.service';
import { DevisService } from './devis.service';
import { DevisController } from './devis.controller';
import { DevisPublicController } from './devis-public.controller';
import { DevisPublicGuard } from './devis-public.guard';
import { ProduitsServicesService } from './produits-services.service';
import { ProduitsServicesController } from './produits-services.controller';

// ProjetsModule importé pour FacturationService (conversion d'un devis
// accepté en facture, cf. DevisService.convertir). OnboardingModule : l'offre
// d'un dossier acceptée fait passer le dossier en Onboard.
@Module({
  imports: [ProjetsModule, NotificationsModule, ReglagesModule, FinancesModule, OnboardingModule],
  providers: [DevisService, ProduitsServicesService, DevisPublicGuard, AvenantsTsService],
  controllers: [DevisController, DevisPublicController, ProduitsServicesController, AvenantsTsController],
  // Le cycle CRM émet l'offre d'un dossier à la validation DAF (étape F).
  exports: [DevisService],
})
export class DevisModule {}
