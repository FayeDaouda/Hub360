import { Module } from '@nestjs/common';
import { SocietesService } from './societes.service';
import { SocietesController } from './societes.controller';

@Module({
  providers: [SocietesService],
  controllers: [SocietesController],
  exports: [SocietesService],
})
export class SocietesModule {}
