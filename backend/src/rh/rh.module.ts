import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { DossiersPersonnelController } from './dossiers.controller';
import { DossiersPersonnelService } from './dossiers.service';
import { DemandesService } from './demandes.service';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { DureesStandardController, FeuillesTempsController, MonTempsController } from './temps.controller';
import { TempsService } from './temps.service';
import { MonEspaceController } from './mon-espace.controller';
import { MonEspaceService } from './mon-espace.service';
import { MesTachesController, ValidationsTachesController } from './taches.controller';
import { TachesService } from './taches.service';
import {
  DemandesRhController,
  MesDemandesController,
  ValidationsAbsencesController,
} from './demandes.controller';

@Module({
  imports: [NotificationsModule, ReglagesModule],
  providers: [DossiersPersonnelService, DemandesService, IntegrationService, TempsService, MonEspaceService, TachesService],
  controllers: [
    DossiersPersonnelController,
    MesDemandesController,
    ValidationsAbsencesController,
    DemandesRhController,
    IntegrationController,
    FeuillesTempsController,
    MonTempsController,
    DureesStandardController,
    MonEspaceController,
    MesTachesController,
    ValidationsTachesController,
  ],
  exports: [TempsService], // Pilotage : feuilles de temps contrôlées
})
export class RhModule {}
