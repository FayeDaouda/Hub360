import { Module } from '@nestjs/common';
import { ComptesGroupeController } from './comptes-groupe.controller';
import { ComptesGroupeService } from './comptes-groupe.service';

@Module({
  providers: [ComptesGroupeService],
  controllers: [ComptesGroupeController],
})
export class GroupeModule {}
