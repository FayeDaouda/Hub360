import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SignalementsController, SuiviSignalementsController } from './signalements.controller';
import { SignalementsService } from './signalements.service';

@Module({
  imports: [NotificationsModule],
  providers: [SignalementsService],
  controllers: [SignalementsController, SuiviSignalementsController],
})
export class SignalementsModule {}
