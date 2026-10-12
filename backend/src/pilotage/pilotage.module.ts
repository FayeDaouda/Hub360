import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { ProjetsModule } from '../projets/projets.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { RhModule } from '../rh/rh.module';
import { PilotageController } from './pilotage.controller';
import { AttentionService } from './attention.service';
import { PilotageService } from './pilotage.service';

@Module({
  // Réglages : objectifs, jours fériés ; RH : feuilles de temps, absences à
  // valider ; Projets et Finances : alertes de l'accueil CEO.
  imports: [ReglagesModule, RhModule, ProjetsModule, FinancesModule],
  providers: [PilotageService, AttentionService],
  controllers: [PilotageController],
})
export class PilotageModule {}
