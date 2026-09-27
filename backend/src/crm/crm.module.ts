import { Module } from '@nestjs/common';
import { DevisModule } from '../devis/devis.module';
import { ProjetsModule } from '../projets/projets.module';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';

// DevisModule : l'offre d'un dossier est un devis, envoyé par la validation
// DAF du cycle (CrmService.agir → DevisService.emettreOffre). ProjetsModule :
// à l'Onboard, l'offre acceptée devient les factures du projet
// (FacturationService.preparerDepuisOffre, étape H2).
@Module({
  imports: [DevisModule, ProjetsModule],
  providers: [CrmService],
  controllers: [CrmController],
})
export class CrmModule {}
