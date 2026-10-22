import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RolesService } from './roles.service';
import { AdministrationService } from './administration.service';
import { AdministrationController, DemandesDroitController, RolesController } from './roles.controller';

@Module({
  imports: [NotificationsModule], // CEO prévenu des changements de droits (revue CIO)
  providers: [RolesService, AdministrationService],
  controllers: [RolesController, DemandesDroitController, AdministrationController],
})
export class RolesModule {}
