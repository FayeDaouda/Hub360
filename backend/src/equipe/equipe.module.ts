import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjetsModule } from '../projets/projets.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { EquipesService } from './equipes.service';
import { EquipesController } from './equipes.controller';
import { CellulesService } from './cellules.service';
import { CellulesController } from './cellules.controller';
import { CollaborateursService } from './collaborateurs.service';
import { CollaborateursController } from './collaborateurs.controller';

@Module({
  imports: [AuthModule, ReglagesModule, ProjetsModule], // ComptesService (invitations) ; jours fériés (charge du mois) ; état commun des tâches
  providers: [CellulesService, CollaborateursService, EquipesService],
  controllers: [
    CellulesController,
    EquipesController,
    CollaborateursController,
  ],
})
export class EquipeModule {}
