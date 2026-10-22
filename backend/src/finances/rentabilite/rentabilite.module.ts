import { Module } from '@nestjs/common';
import { ReglagesModule } from '../../reglages/reglages.module';
import { RhModule } from '../../rh/rh.module';
import { RentabiliteController } from './rentabilite.controller';
import { RentabiliteService } from './rentabilite.service';

// Module à part (et non dans FinancesModule) : il lit les feuilles de temps
// (RhModule), qui dépend de Projets, qui dépend de Finances — pas de cycle.
@Module({
  imports: [ReglagesModule, RhModule],
  providers: [RentabiliteService],
  controllers: [RentabiliteController],
  // Marge provisoire de la synthèse mensuelle du CEO (Pilotage).
  exports: [RentabiliteService],
})
export class RentabiliteModule {}
