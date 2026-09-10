import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CellulesService } from './cellules.service';
import { CellulesController } from './cellules.controller';
import { CollaborateursService } from './collaborateurs.service';
import { CollaborateursController } from './collaborateurs.controller';
import { MonProfilController } from './mon-profil.controller';
import { IndicateursController } from './indicateurs.controller';
import { AccesIndicateursGuard } from './acces-indicateurs.guard';

@Module({
  imports: [AuthModule], // ComptesService (invitation des collaborateurs)
  providers: [CellulesService, CollaborateursService, AccesIndicateursGuard],
  controllers: [
    CellulesController,
    CollaborateursController,
    MonProfilController,
    IndicateursController,
  ],
})
export class EquipeModule {}
