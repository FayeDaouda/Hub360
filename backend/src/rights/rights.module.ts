import { Global, Module } from '@nestjs/common';
import { RightsService } from './rights.service';
import { RightsNoticesController } from './rights-notices.controller';

// Global : la session (JwtStrategy, AuthService) et la matrice lisent et
// vident les mêmes droits en mémoire.
@Global()
@Module({
  controllers: [RightsNoticesController],
  providers: [RightsService],
  exports: [RightsService],
})
export class RightsModule {}
