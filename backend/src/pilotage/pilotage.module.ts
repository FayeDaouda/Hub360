import { Module } from '@nestjs/common';
import { ReglagesModule } from '../reglages/reglages.module';
import { RhModule } from '../rh/rh.module';
import { PilotageController } from './pilotage.controller';
import { PilotageService } from './pilotage.service';

@Module({
  imports: [ReglagesModule, RhModule], // objectifs et jours fériés ; feuilles de temps
  providers: [PilotageService],
  controllers: [PilotageController],
})
export class PilotageModule {}
