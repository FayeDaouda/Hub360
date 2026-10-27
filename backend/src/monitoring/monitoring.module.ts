import { Module } from '@nestjs/common';
import { BackupWatch } from './backup-watch.service';
import { ClientErrorsController } from './client-errors.controller';
import { ErrorReporter } from './error-reporter.service';
import { HealthController } from './health.controller';

// Exploitation : suivi des erreurs, état de santé de l'API, surveillance des
// sauvegardes.
@Module({
  controllers: [HealthController, ClientErrorsController],
  providers: [ErrorReporter, BackupWatch],
  exports: [ErrorReporter],
})
export class MonitoringModule {}
