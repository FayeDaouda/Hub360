import { Module } from '@nestjs/common';
import { SocietesService } from './societes.service';
import { SocietesController } from './societes.controller';
import { TableauBordController } from './tableau-bord/tableau-bord.controller';
import { TableauBordService } from './tableau-bord/tableau-bord.service';

@Module({
  providers: [SocietesService, TableauBordService],
  controllers: [SocietesController, TableauBordController],
  exports: [SocietesService],
})
export class SocietesModule {}
