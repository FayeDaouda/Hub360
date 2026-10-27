import { Module } from '@nestjs/common';
import { ReglagesModule } from '../reglages/reglages.module';
import { ProductionService } from './production.service';
import { ProjectAlertsService } from './project-alerts.service';
import { ProjectFileService } from './project-file.service';
import { ProjectSiteService } from './project-site.service';
import { ProjectStatesService } from './project-states.service';
import { ProjectsBoardService } from './projects-board.service';

// Projets ouverts selon le gabarit : lecture (tableau, dossier, production,
// alertes) et réglages du chantier. Les tâches et les fils de discussion
// suivent (S3). ProjectStatesService est la règle unique des états, partagée
// par Équipes, Mes tâches et le Pilotage ; ProjectAlertsService sert l'accueil
// de la direction.
@Module({
  imports: [ReglagesModule],
  providers: [
    ProjectStatesService,
    ProjectsBoardService,
    ProjectFileService,
    ProductionService,
    ProjectAlertsService,
    ProjectSiteService,
  ],
  exports: [
    ProjectStatesService,
    ProjectsBoardService,
    ProjectFileService,
    ProductionService,
    ProjectAlertsService,
    ProjectSiteService,
  ],
})
export class ProjectsModule {}
