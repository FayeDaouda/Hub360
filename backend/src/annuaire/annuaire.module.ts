import { Module } from '@nestjs/common';
import { AnnuaireController, PerimetreAnnuaireController } from './annuaire.controller';
import { AnnuaireService } from './annuaire.service';

@Module({
  providers: [AnnuaireService],
  controllers: [AnnuaireController, PerimetreAnnuaireController],
})
export class AnnuaireModule {}
