import { Module } from '@nestjs/common';
import { RechercheController } from './recherche.controller';
import { RechercheService } from './recherche.service';

@Module({
  providers: [RechercheService],
  controllers: [RechercheController],
})
export class RechercheModule {}
