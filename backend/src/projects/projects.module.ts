import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { ProductionService } from './production.service';
import { ProjectAlertsService } from './project-alerts.service';
import { ProjectFileService } from './project-file.service';
import { ProjectSiteService } from './project-site.service';
import { ProjectStatesService } from './project-states.service';
import { ProjectsBoardService } from './projects-board.service';
import { ReviewCircuitService } from './review-circuit.service';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskExtensionService } from './task-extension.service';
import { TaskReviewService } from './task-review.service';
import { TaskSubmissionService } from './task-submission.service';
import { TsElementsService } from './ts-elements.service';

// Projets ouverts selon le gabarit : lecture (tableau, dossier, production,
// alertes), réglages du chantier et écritures sur les tâches (assignation,
// remise, décision, visa, prolongations, ajout en TS). Les fils de discussion
// suivent (S3). ProjectStatesService est la règle unique des états, partagée
// par Équipes, Mes tâches et le Pilotage ; ProjectAlertsService sert l'accueil
// de la direction ; les services des tâches servent aussi Mes tâches et Mon
// espace (remise, validation) et les avenants TS (ajout en TS).
@Module({
  imports: [ReglagesModule, NotificationsModule],
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
  ],
})
export class ProjectsModule {}
