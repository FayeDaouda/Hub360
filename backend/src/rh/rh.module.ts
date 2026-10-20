import { Module } from '@nestjs/common';
import { AlertesRhController } from './alertes-rh.controller';
import { AlertesRhService } from './alertes-rh.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { ProjetsModule } from '../projets/projets.module';
import { DossiersPersonnelController } from './dossiers.controller';
import { DossiersPersonnelService } from './dossiers.service';
import { DemandesService } from './demandes.service';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { FeuillesTempsController, MonTempsController } from './temps.controller';
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
  imports: [NotificationsModule, ReglagesModule, ProjetsModule], // ProjetsModule : remise / validation des tâches du gabarit
  providers: [AlertesRhService, DossiersPersonnelService, DemandesService, IntegrationService, TempsService, MonEspaceService, TachesService],
  controllers: [
    AlertesRhController,
    DossiersPersonnelController,
    MesDemandesController,
    ValidationsAbsencesController,
    DemandesRhController,
    IntegrationController,
    FeuillesTempsController,
    MonTempsController,
    MonEspaceController,
    MesTachesController,
    ValidationsTachesController,
  ],
  // Pilotage : feuilles de temps contrôlées, absences à valider (N+1),
  // points d'intégration (tuiles RH).
  exports: [TempsService, DemandesService, IntegrationService],
})
export class RhModule {}
