import { Module } from '@nestjs/common';
import { ReglagesModule } from '../reglages/reglages.module';
import { FeuilleTempsService } from './feuille-temps.service';
import { FinancesController } from './finances.controller';
import { SeuilCeoGuard } from './seuil-ceo.guard';
import { SeuilCeoService } from './seuil-ceo.service';

@Module({
  imports: [ReglagesModule],
  providers: [FeuilleTempsService, SeuilCeoService, SeuilCeoGuard],
  controllers: [FinancesController],
  // Validation du CEO au-delà du seuil : contrôlée par Devis, Facturation, CRM.
  exports: [SeuilCeoService, SeuilCeoGuard],
})
export class FinancesModule {}
