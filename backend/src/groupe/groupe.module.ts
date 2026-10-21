import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ComptesGroupeController } from './comptes-groupe.controller';
import { ComptesGroupeService } from './comptes-groupe.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  providers: [ComptesGroupeService],
  controllers: [ComptesGroupeController],
})
export class GroupeModule {}
