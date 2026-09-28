import { Module } from '@nestjs/common';
import { DossiersPersonnelController } from './dossiers.controller';
import { DossiersPersonnelService } from './dossiers.service';
import { DemandesService } from './demandes.service';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import {
  DemandesRhController,
  MesDemandesController,
  ValidationsAbsencesController,
} from './demandes.controller';

@Module({
  providers: [DossiersPersonnelService, DemandesService, IntegrationService],
  controllers: [
    DossiersPersonnelController,
    MesDemandesController,
    ValidationsAbsencesController,
    DemandesRhController,
    IntegrationController,
  ],
})
export class RhModule {}
