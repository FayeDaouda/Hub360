import { Module } from '@nestjs/common';
import { ProjetsModule } from '../projets/projets.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { OnboardingService } from './onboarding.service';

// Onboard d'un dossier (OnboardingService) : partagé par DevisModule (l'offre
// acceptée déclenche l'Onboard) et CrmModule (déblocage de l'Administrateur
// HUB). ProjetsModule : FacturationService.preparerDepuisOffre et
// ProjectOpeningService (ouverture du projet à l'Onboard).
@Module({
  imports: [ProjetsModule, ReglagesModule],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
