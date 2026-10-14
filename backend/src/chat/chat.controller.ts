import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { CompteCommeLecture, PermissionSelonMethode } from '../commun/permission.decorator';
import { PermissionGuard } from '../commun/permission.guard';
import { AccesCanalGuard } from './acces-canal.guard';
import { ChatService } from './chat.service';
import { TicketStore } from './ticket.store';
import { EnvoyerMessageDto, OuvrirDirectDto } from './dto';

type R = {
  user: {
    userId: string;
    societeId: string;
    societeSlug: string;
    role: string;
  };
};

// Membre de la société (MembreSocieteGuard) ET module « communication » de la
// matrice (13/10/2026, application stricte) : aucun = pas de chat, lecture =
// lit sans écrire, écriture = participe. Le cloisonnement par canal est
// appliqué en plus par AccesCanalGuard sur les routes /:id. L'envoi passe par
// REST — le flux SSE (étape 3) ne sert qu'à recevoir.
@Controller('societes/:slug')
@PermissionSelonMethode('communication')
@UseGuards(JwtAuthGuard, MembreSocieteGuard, PermissionGuard)
export class ChatController {
  constructor(
    private chat: ChatService,
    private tickets: TicketStore,
  ) {}

  @Get('canaux')
  canaux(@Req() req: R) {
    return this.chat.listerCanaux(req.user);
  }

  @Get('canaux/:id/messages')
  @UseGuards(AccesCanalGuard)
  messages(@Param('id') id: string, @Query('curseur') curseur?: string) {
    return this.chat.messages(id, curseur);
  }

  @Post('canaux/:id/messages')
  @UseGuards(AccesCanalGuard)
  envoyer(@Req() req: R, @Param('id') id: string, @Body() dto: EnvoyerMessageDto) {
    return this.chat.envoyer(id, req.user.userId, dto.texte);
  }

  @Patch('canaux/:id/lecture')
  @CompteCommeLecture()
  @UseGuards(AccesCanalGuard)
  lecture(@Req() req: R, @Param('id') id: string) {
    return this.chat.marquerLu(id, req.user.userId, req.user.societeId);
  }

  @Get('annuaire')
  annuaire(@Req() req: R) {
    return this.chat.annuaire(req.user);
  }

  @Post('canaux/direct')
  ouvrirDirect(@Req() req: R, @Body() dto: OuvrirDirectDto) {
    return this.chat.ouvrirDirect(req.user, dto.avecUtilisateurId);
  }

  // Jeton court pour l'URL du flux SSE (EventSource ne pose pas d'en-tête).
  @Post('chat/ticket')
  @CompteCommeLecture()
  ticket(@Req() req: R) {
    return {
      token: this.tickets.emettre({
        userId: req.user.userId,
        societeId: req.user.societeId,
        societeSlug: req.user.societeSlug,
        role: req.user.role,
      }),
    };
  }
}
