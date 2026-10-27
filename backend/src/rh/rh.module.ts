import { Module } from '@nestjs/common';
import { AlertesRhController } from './alertes-rh.controller';
import { AlertesRhService } from './alertes-rh.service';
import { SalairesController } from './salaires.controller';
import { SalairesService } from './salaires.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { DossiersPersonnelController } from './dossiers.controller';
import { DossiersPersonnelService } from './dossiers.service';
import { DemandesService } from './demandes.service';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { FeuillesTempsController, MonTempsController } from './temps.controller';
import { TempsService } from './temps.service';
import { DemandesRhController, MesDemandesController, ValidationsAbsencesController } from './demandes.controller';

@Module({
  imports: [NotificationsModule, ReglagesModule],
  providers: [
    AlertesRhService,
    DossiersPersonnelService,
    SalairesService,
    DemandesService,
    IntegrationService,
    TempsService,
  ],
  controllers: [
    SalairesController,
    AlertesRhController,
    DossiersPersonnelController,
    MesDemandesController,
    ValidationsAbsencesController,
    DemandesRhController,
    IntegrationController,
    FeuillesTempsController,
    MonTempsController,
  ],
  // Pilotage : feuilles de temps contrôlées, absences à valider (N+1),
  // points d'intégration (tuiles RH).
  exports: [TempsService, DemandesService, IntegrationService, AlertesRhService],
})
export class RhModule {}
