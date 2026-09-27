import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { ContratsService } from './contrats.service';
import { ContratsController, ParametresContratController } from './contrats.controller';
import { ContratPublicGuard, ContratsPublicController } from './contrats-public.controller';

// Contrat (étape G) — CrmModule : la signature fait passer le dossier en
// « onboard » (CrmService.onboarderParContrat).
@Module({
  imports: [CrmModule],
  providers: [ContratsService, ContratPublicGuard],
  controllers: [ContratsController, ParametresContratController, ContratsPublicController],
})
export class ContratsModule {}
