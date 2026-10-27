import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjetsModule } from '../projets/projets.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { CellsService } from './cells.service';
import { CellsController } from './cells.controller';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';

@Module({
  imports: [AuthModule, ReglagesModule, ProjetsModule], // ComptesService (invitations) ; jours fériés (charge du mois) ; état commun des tâches
  providers: [CellsService, EmployeesService, TeamsService],
  controllers: [CellsController, TeamsController, EmployeesController],
})
export class TeamsModule {}
