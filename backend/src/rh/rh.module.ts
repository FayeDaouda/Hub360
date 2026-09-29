import { Module } from '@nestjs/common';
import { DossiersPersonnelController } from './dossiers.controller';
import { DossiersPersonnelService } from './dossiers.service';
import { DemandesService } from './demandes.service';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { DureesStandardController, FeuillesTempsController, MonTempsController } from './temps.controller';
import { TempsService } from './temps.service';
import {
  DemandesRhController,
  MesDemandesController,
  ValidationsAbsencesController,
} from './demandes.controller';

@Module({
  providers: [DossiersPersonnelService, DemandesService, IntegrationService, TempsService],
  controllers: [
    DossiersPersonnelController,
    MesDemandesController,
    ValidationsAbsencesController,
    DemandesRhController,
    IntegrationController,
    FeuillesTempsController,
    MonTempsController,
    DureesStandardController,
  ],
})
export class RhModule {}
