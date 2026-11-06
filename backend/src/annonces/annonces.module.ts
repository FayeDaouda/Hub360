import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnnoncesController } from './annonces.controller';
import { AnnoncesService } from './annonces.service';

@Module({
  imports: [NotificationsModule],
  providers: [AnnoncesService],
  controllers: [AnnoncesController],
})
export class AnnoncesModule {}
