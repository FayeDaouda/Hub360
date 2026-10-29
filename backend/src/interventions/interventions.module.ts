import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { ProjectsModule } from '../projects/projects.module';
import { InterventionsController } from './interventions.controller';
import { InterventionsService } from './interventions.service';

// Déblocages de l'Administrateur HUB : l'Onboard du CRM et l'ouverture des
// projets sont repris tels quels (CrmModule, ProjectsModule).
@Module({
  imports: [CrmModule, ProjectsModule],
  controllers: [InterventionsController],
  providers: [InterventionsService],
})
export class InterventionsModule {}
