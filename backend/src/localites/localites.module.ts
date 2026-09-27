import { Module } from '@nestjs/common';
import { LocalitesService } from './localites.service';
import { LocalitesController } from './localites.controller';

@Module({
  providers: [LocalitesService],
  controllers: [LocalitesController],
})
export class LocalitesModule {}
