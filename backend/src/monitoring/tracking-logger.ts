import { ConsoleLogger } from '@nestjs/common';
import type { ErrorReporter } from './error-reporter.service';

// Journal de Nest (même sortie que celui par défaut) dont chaque erreur passe
// aussi au suivi : tâches planifiées, échecs d'envoi d'e-mail, planificateur…
// Les 5xx de l'API sont suivies par le filtre global, avec leur route et leur
// utilisateur : son contexte (« Exception ») est ignoré ici.
export class TrackingLogger extends ConsoleLogger {
  private reporter: ErrorReporter | null = null;

  attach(reporter: ErrorReporter): void {
    this.reporter = reporter;
  }

  error(message: unknown, ...params: unknown[]): void {
    super.error(message, ...params);
    const context =
      typeof params[params.length - 1] === 'string' ? (params[params.length - 1] as string) : this.context;
    if (!this.reporter || context === 'Exception') return;
    const stack = params.find((p): p is string => typeof p === 'string' && p.includes('\n    at '));
    this.reporter.report({
      source: 'serveur',
      route: context ?? 'serveur',
      message: message instanceof Error ? message.message : String(message),
      stack: stack ?? (message instanceof Error ? message.stack : undefined),
    });
  }
}
