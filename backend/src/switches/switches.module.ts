import { Global, Module } from '@nestjs/common';
import { SwitchesController } from './switches.controller';
import { SwitchesService } from './switches.service';

// Global : la garde des permissions (posée dans tous les modules) et la
// session lisent les interrupteurs.
@Global()
@Module({
  controllers: [SwitchesController],
  providers: [SwitchesService],
  exports: [SwitchesService],
})
export class SwitchesModule {}
