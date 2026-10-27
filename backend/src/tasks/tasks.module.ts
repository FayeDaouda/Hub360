import { Module } from '@nestjs/common';
import { ProjetsModule } from '../projets/projets.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { MyTasksController } from './my-tasks.controller';
import { TaskReviewsController } from './task-reviews.controller';
import { TasksService } from './tasks.service';

// Tâches assignées : Mes tâches (l'assigné) et les remises à valider (N+1).
// ProjetsModule : remise et validation passent par les règles de Projets.
@Module({
  imports: [ReglagesModule, ProjetsModule],
  providers: [TasksService],
  controllers: [MyTasksController, TaskReviewsController],
  // Mon espace · Ma cellule : statistiques de l'équipe.
  exports: [TasksService],
})
export class TasksModule {}
