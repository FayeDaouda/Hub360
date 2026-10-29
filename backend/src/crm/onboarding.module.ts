import { Module } from '@nestjs/common';
import { ProjetsModule } from '../projets/projets.module';
import { OnboardingService } from './onboarding.service';

// Onboard d'un dossier (OnboardingService) : partagé par DevisModule (l'offre
// acceptée déclenche l'Onboard) et CrmModule (déblocage de l'Administrateur
// HUB). ProjetsModule : FacturationService.preparerDepuisOffre.
@Module({
  imports: [ProjetsModule],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
