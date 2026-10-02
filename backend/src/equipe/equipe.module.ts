import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { EquipesService } from './equipes.service';
import { EquipesController } from './equipes.controller';
import { CellulesService } from './cellules.service';
import { CellulesController } from './cellules.controller';
import { CollaborateursService } from './collaborateurs.service';
import { CollaborateursController } from './collaborateurs.controller';
import { MonProfilController } from './mon-profil.controller';
import { IndicateursController } from './indicateurs.controller';
import { AccesIndicateursGuard } from './acces-indicateurs.guard';

@Module({
  imports: [AuthModule, ReglagesModule], // ComptesService (invitations) ; jours fériés (charge du mois)
  providers: [CellulesService, CollaborateursService, EquipesService, AccesIndicateursGuard],
  controllers: [
    CellulesController,
    EquipesController,
    CollaborateursController,
    MonProfilController,
    IndicateursController,
  ],
})
export class EquipeModule {}
