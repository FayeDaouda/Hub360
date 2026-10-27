import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { MySpaceController } from './my-space.controller';
import { MySpaceService } from './my-space.service';

// « Mon espace » : le dossier du compte connecté, ses documents et sa cellule
// (statistiques des tâches de l'équipe : TasksModule).
@Module({
  imports: [TasksModule],
  providers: [MySpaceService],
  controllers: [MySpaceController],
})
export class MySpaceModule {}
