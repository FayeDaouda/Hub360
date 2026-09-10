import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccesProjetGuard } from './acces-projet.guard';
import { ProjetsService } from './projets.service';
import { ProjetsController } from './projets.controller';
import { AvantProjetController } from './avant-projet.controller';
import { PreBilanController } from './pre-bilan.controller';
import { PhaseController } from './phase.controller';
import { PermisService } from './permis/permis.service';
import { PermisController } from './permis/permis.controller';
import { EtudesService } from './etudes/etudes.service';
import { EtudesController } from './etudes/etudes.controller';
import { ExecutionService } from './execution/execution.service';
import { ExecutionController } from './execution/execution.controller';
import { ImagesService } from './images/images.service';
import { FichiersService } from './fichiers/fichiers.service';
import { ImagesController } from './images/images.controller';
import { FichiersController } from './fichiers/fichiers.controller';
import { FacturationService } from './facturation/facturation.service';
import { FacturationController } from './facturation/facturation.controller';

// L'agrégat « projet » : le tronc (assignation, phase) plus les sections aval,
// chacune avec son service + son contrôleur mais sous le même module —
// frontière métier unique. Voir l'artifact « Backend Grey Concrete » §05 / §08.
@Module({
  imports: [NotificationsModule],
  providers: [
    AccesProjetGuard,
    ProjetsService,
    PermisService,
    EtudesService,
    ExecutionService,
    ImagesService,
    FichiersService,
    FacturationService,
  ],
  controllers: [
    ProjetsController,
    AvantProjetController,
    PreBilanController,
    PhaseController,
    PermisController,
    EtudesController,
    ExecutionController,
    ImagesController,
    FichiersController,
    FacturationController,
  ],
})
export class ProjetsModule {}
