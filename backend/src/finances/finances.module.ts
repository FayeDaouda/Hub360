import { Module } from '@nestjs/common';
import { ReglagesModule } from '../reglages/reglages.module';
import { FeuilleTempsService } from './feuille-temps.service';
import { FinancesController } from './finances.controller';

@Module({
  imports: [ReglagesModule],
  providers: [FeuilleTempsService],
  controllers: [FinancesController],
})
export class FinancesModule {}
