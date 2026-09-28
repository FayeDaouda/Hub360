import { Module } from '@nestjs/common';
import { DossiersPersonnelController } from './dossiers.controller';
import { DossiersPersonnelService } from './dossiers.service';

@Module({
  providers: [DossiersPersonnelService],
  controllers: [DossiersPersonnelController],
})
export class RhModule {}
