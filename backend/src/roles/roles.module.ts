import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RolesService } from './roles.service';
import { AdministrationService } from './administration.service';
import { AdministrationController, RolesController } from './roles.controller';

@Module({
  imports: [NotificationsModule], // titulaires du rôle et CEO prévenus des changements de droits
  providers: [RolesService, AdministrationService],
  controllers: [RolesController, AdministrationController],
})
export class RolesModule {}
