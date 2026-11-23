import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AbonnementAgendaGuard } from './abonnement.guard';
import { AbonnementAgendaService, type AbonnementLu } from './abonnement.service';

type R = { abonnementAgenda: AbonnementLu };

// Calendrier relu par Google Agenda, Apple Calendrier ou Outlook (12/11/2026)
// — SANS session : le jeton du lien est l'authentification. Limité en débit
// comme les autres liens publics ; un agenda relit son abonnement au plus
// quelques fois par heure.
@Controller('agenda-abonnement')
@UseGuards(ThrottlerGuard, AbonnementAgendaGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AbonnementAgendaPublicController {
  constructor(private abonnements: AbonnementAgendaService) {}

  @Get(':fichier')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'inline; filename="agenda-hub.ics"')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Robots-Tag', 'noindex')
  flux(@Req() req: R): Promise<string> {
    return this.abonnements.flux(req.abonnementAgenda);
  }
}
