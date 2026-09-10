import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

// Filtre d'exception global : une seule forme de réponse d'erreur, et RIEN qui
// fuite l'implémentation vers le client (stack traces, noms de tables /
// colonnes / contraintes Prisma). Les HttpException métier (gardes, validation,
// 404/409 des services) passent telles quelles — le front lit `message`.

type CorpsErreur = { statusCode: number; error: string; message: unknown };

@Catch()
export class FiltreExceptionsGlobal implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, corps } = this.resoudre(exception);

    if (status >= 500) {
      // Le détail complet reste côté serveur.
      this.logger.error(
        `${req.method} ${req.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({ ...corps, timestamp: new Date().toISOString(), path: req.url });
  }

  private resoudre(exception: unknown): { status: number; corps: CorpsErreur } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const reponse = exception.getResponse();
      if (typeof reponse === 'string') {
        return { status, corps: { statusCode: status, error: nomStatut(status), message: reponse } };
      }
      const o = reponse as Record<string, unknown>;
      return {
        status,
        corps: {
          statusCode: status,
          error: (o.error as string) ?? nomStatut(status),
          message: o.message ?? exception.message, // string OU string[] (validation) — conservé tel quel
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.depuisPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return err(HttpStatus.BAD_REQUEST, 'Requête invalide.');
    }

    return err(HttpStatus.INTERNAL_SERVER_ERROR, 'Une erreur interne est survenue.');
  }

  // Codes Prisma courants → statut correct, message générique. `e.meta` (cibles
  // des contraintes) n'est JAMAIS relayé.
  private depuisPrisma(e: Prisma.PrismaClientKnownRequestError): {
    status: number;
    corps: CorpsErreur;
  } {
    switch (e.code) {
      case 'P2002':
        return err(HttpStatus.CONFLICT, 'Cette ressource existe déjà.');
      case 'P2003':
        return err(HttpStatus.CONFLICT, 'Référence liée invalide.');
      case 'P2025':
        return err(HttpStatus.NOT_FOUND, 'Ressource introuvable.');
      case 'P2000':
        return err(HttpStatus.BAD_REQUEST, 'Donnée trop longue pour le champ.');
      default:
        return err(HttpStatus.INTERNAL_SERVER_ERROR, 'Une erreur interne est survenue.');
    }
  }
}

function err(status: number, message: string): { status: number; corps: CorpsErreur } {
  return { status, corps: { statusCode: status, error: nomStatut(status), message } };
}

function nomStatut(status: number): string {
  const cle = HttpStatus[status] as string | undefined;
  if (!cle) return 'Error';
  return cle
    .toLowerCase()
    .split('_')
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join(' ');
}
