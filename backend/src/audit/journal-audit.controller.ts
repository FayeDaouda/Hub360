import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { JournalAuditService } from './journal-audit.service';

type R = { user: { userId: string; societeId: string; role: string; adminHub: boolean } };

// Journal d'audit (Pilotage › Journal) — le service réserve la lecture au
// CEO, au CIO et à l'administration de la société.
@Controller('societes/:slug/journal-audit')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class JournalAuditController {
  constructor(private journal: JournalAuditService) {}

  @Get()
  lire(@Req() req: R, @Query('debut') debut?: string, @Query('fin') fin?: string) {
    return this.journal.journal(req.user, debut, fin);
  }
}
