import { Module } from '@nestjs/common';
import { ReglagesModule } from '../reglages/reglages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContratsService } from './contrats.service';
import { ContratsController, ParametresContratController } from './contrats.controller';
import { ContratPublicGuard, ContratsPublicController } from './contrats-public.controller';

// Contrat (étape G) — préparé et signé après l'Onboard, pour régulariser ;
// NotificationsModule : la signature prévient le propriétaire du dossier.
@Module({
  imports: [NotificationsModule, ReglagesModule],
  providers: [ContratsService, ContratPublicGuard],
  controllers: [ContratsController, ParametresContratController, ContratsPublicController],
})
export class ContratsModule {}
