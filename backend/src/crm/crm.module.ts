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
import { OnboardingModule } from './onboarding.module';

// DevisModule : l'offre d'un dossier est un devis, envoyé par la validation
// DAF du cycle (CrmService.agir → DevisService.emettreOffre). ProjetsModule :
// à l'Onboard, l'offre acceptée devient les factures du projet
// (FacturationService.preparerDepuisOffre, étape H2), via OnboardingModule.
@Module({
  imports: [DevisModule, ProjetsModule, NotificationsModule, FinancesModule, AuthModule, OnboardingModule],
  providers: [CrmService, CommercialService, CommissionsService],
  controllers: [CrmController, CommissionsController],
  // Déblocages de l'Administrateur HUB (Onboard d'une offre acceptée en attente).
  exports: [CrmService],
})
export class CrmModule {}
