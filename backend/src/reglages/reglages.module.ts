import { Module } from '@nestjs/common';
import { ReglagesController } from './reglages.controller';
import { ReglagesService } from './reglages.service';

// Exporte le service : les modules qui appliquent un réglage (RH : jours
// fériés) le lisent par lui, jamais en dur.
@Module({
  providers: [ReglagesService],
  controllers: [ReglagesController],
  exports: [ReglagesService],
})
export class ReglagesModule {}
