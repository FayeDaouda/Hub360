import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RhModule } from '../rh/rh.module';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

@Module({
  imports: [NotificationsModule, RhModule], // demandes d'absence à trancher
  providers: [AgendaService],
  controllers: [AgendaController],
})
export class AgendaModule {}
