import { Module } from '@nestjs/common';
import { ProjetsModule } from '../projets/projets.module';
import { DevisService } from './devis.service';
import { DevisController } from './devis.controller';
import { DevisPublicController } from './devis-public.controller';
import { DevisPublicGuard } from './devis-public.guard';
import { ProduitsServicesService } from './produits-services.service';
import { ProduitsServicesController } from './produits-services.controller';

// ProjetsModule importé pour FacturationService (conversion d'un devis
// accepté en facture, cf. DevisService.convertir).
@Module({
  imports: [ProjetsModule],
  providers: [DevisService, ProduitsServicesService, DevisPublicGuard],
  controllers: [DevisController, DevisPublicController, ProduitsServicesController],
  // Le cycle CRM émet l'offre d'un dossier à la validation DAF (étape F).
  exports: [DevisService],
})
export class DevisModule {}
