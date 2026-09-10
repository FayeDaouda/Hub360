import { Global, Logger, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { LogEmailService } from './log-email.service';
import { SmtpEmailService } from './smtp-email.service';

// Choix du transport au démarrage. `log` par défaut ; `smtp` seulement si
// SMTP_HOST est présent, sinon on retombe sur `log` avec un avertissement
// (mauvaise config = pas de crash, mais visible).
@Global()
@Module({
  providers: [
    {
      provide: EmailService,
      useFactory: (): EmailService => {
        const log = new Logger('Email');
        const transport = (process.env.EMAIL_TRANSPORT || 'log').toLowerCase();

        if (transport === 'smtp') {
          if (process.env.SMTP_HOST) {
            log.log(`transport : smtp (${process.env.SMTP_HOST})`);
            return new SmtpEmailService();
          }
          log.warn('EMAIL_TRANSPORT=smtp mais SMTP_HOST absent — repli sur « log »');
        }
        log.log('transport : log (aucun email réellement envoyé)');
        return new LogEmailService();
      },
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
