import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocieteAccesGuard } from '../commun/societe-acces.guard';
import { ClientsService } from './clients.service';

@Controller('societes/:slug/clients')
@UseGuards(JwtAuthGuard, SocieteAccesGuard)
export class ClientsController {
  constructor(private clients: ClientsService) {}

  @Get()
  findAll(@Req() req: { user: { societeId: string } }) {
    return this.clients.findAll(req.user.societeId);
  }
}
