import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { OpenProjectsController } from './open-projects.controller';
import { ProductionService } from './production.service';
import { ProjectAlertsService } from './project-alerts.service';
import { ProjectCustomizationService } from './project-customization.service';
import { ProjectFileService } from './project-file.service';
import { ProjectOpeningService } from './project-opening.service';
import { ProjectSiteService } from './project-site.service';
import { ProjectTeamsController } from './project-teams.controller';
import { ProjectTeamsService } from './project-teams.service';
import { ProjectStatesService } from './project-states.service';
import { ProjectThreadsService } from './project-threads.service';
import { ProjectsBoardService } from './projects-board.service';
import { ReviewCircuitService } from './review-circuit.service';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskExtensionService } from './task-extension.service';
import { TaskReviewService } from './task-review.service';
import { TaskSubmissionService } from './task-submission.service';
import { TsElementsService } from './ts-elements.service';

// Projets ouverts selon le gabarit : lecture (tableau, dossier, production,
// alertes), réglages du chantier, écritures sur les tâches (assignation,
// remise, décision, visa, prolongations, ajout en TS), fils de discussion et
// ouverture d'un projet. ProjectStatesService est la règle unique des états,
// partagée par Équipes, Mes tâches et le Pilotage ; ProjectAlertsService sert
// l'accueil de la direction ; les services des tâches servent aussi Mes
// tâches et Mon espace (remise, validation) et les avenants TS (ajout en
// TS) ; ProjectOpeningService sert la facturation (ouverture à l'émission de F1).
// ProjectTeamsService : équipes d'un projet, affectées par le Dir. GC.
@Module({
  imports: [ReglagesModule, NotificationsModule],
  controllers: [OpenProjectsController, ProjectTeamsController],
  providers: [
    ProjectStatesService,
    ProjectsBoardService,
    ProjectFileService,
    ProductionService,
    ProjectAlertsService,
    ProjectSiteService,
    ReviewCircuitService,
    TaskAssignmentService,
    TaskSubmissionService,
    TaskReviewService,
    TaskExtensionService,
    TsElementsService,
    ProjectThreadsService,
    ProjectOpeningService,
    ProjectTeamsService,
    ProjectCustomizationService,
  ],
  exports: [
    ProjectStatesService,
    ProjectsBoardService,
    ProjectFileService,
    ProductionService,
    ProjectAlertsService,
    ProjectSiteService,
    ReviewCircuitService,
    TaskAssignmentService,
    TaskSubmissionService,
    TaskReviewService,
    TaskExtensionService,
    TsElementsService,
    ProjectOpeningService,
  ],
})
export class ProjectsModule {}
