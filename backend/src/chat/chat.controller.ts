import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { CompteCommeLecture, PermissionSelonMethode, RequiertPermission } from '../commun/permission.decorator';
import { PermissionGuard } from '../commun/permission.guard';
import { AccesCanalGuard } from './acces-canal.guard';
import { ChatService } from './chat.service';
import { TicketStore } from '../realtime/ticket.store';
import {
  AjouterMembresDto,
  CreerGroupeDto,
  EnvoyerMessageDto,
  ModifierMessageDto,
  OuvrirDirectDto,
  ReactionDto,
  RenommerGroupeDto,
} from './dto';

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
    return this.chat.envoyer(id, req.user.userId, dto.texte, dto.mentionIds ?? [], {
      reponseAId: dto.reponseAId,
      pieces: dto.pieces,
      mentionTous: dto.mentionTous,
    });
  }

  // Recherche dans ses conversations (02/11/2026).
  @Get('canaux/recherche')
  @CompteCommeLecture()
  rechercher(@Req() req: R, @Query('q') q = '') {
    return this.chat.rechercher(req.user, q);
  }

  // Son auteur modifie ou supprime un message pendant 15 minutes.
  @Patch('canaux/:id/messages/:messageId')
  @UseGuards(AccesCanalGuard)
  modifier(
    @Req() req: R,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: ModifierMessageDto,
  ) {
    return this.chat.modifier(req.user, id, messageId, dto.texte);
  }

  // Supprimer son propre message : un acte d'écriture, pas la Suppression du module.
  @Delete('canaux/:id/messages/:messageId')
  @RequiertPermission('communication', 'ecriture')
  @UseGuards(AccesCanalGuard)
  supprimer(@Req() req: R, @Param('id') id: string, @Param('messageId') messageId: string) {
    return this.chat.supprimer(req.user, id, messageId);
  }

  @Post('canaux/:id/messages/:messageId/reactions')
  @UseGuards(AccesCanalGuard)
  reagir(@Req() req: R, @Param('id') id: string, @Param('messageId') messageId: string, @Body() dto: ReactionDto) {
    return this.chat.reagir(req.user, id, messageId, dto.emoji);
  }

  @Get('canaux/:id/messages/:messageId/pieces/:pieceId')
  @UseGuards(AccesCanalGuard)
  piece(@Param('id') id: string, @Param('messageId') messageId: string, @Param('pieceId') pieceId: string) {
    return this.chat.piece(id, messageId, pieceId);
  }

  // « En train d'écrire… » et lectures (« vu par »).
  @Post('canaux/:id/frappe')
  @CompteCommeLecture()
  @UseGuards(AccesCanalGuard)
  frappe(@Req() req: R, @Param('id') id: string) {
    return this.chat.frappe(req.user, id);
  }

  @Get('canaux/:id/lectures')
  @UseGuards(AccesCanalGuard)
  lectures(@Param('id') id: string) {
    return this.chat.lectures(id);
  }

  // Personnes qu'on peut mentionner (@) dans cette conversation.
  @Get('canaux/:id/mentionnables')
  @UseGuards(AccesCanalGuard)
  mentionnables(@Param('id') id: string) {
    return this.chat.mentionnables(id);
  }

  // Groupes de discussion (01/11/2026) : création, membres, nom, départ.
  @Post('canaux/groupes')
  creerGroupe(@Req() req: R, @Body() dto: CreerGroupeDto) {
    return this.chat.creerGroupe(req.user, dto.nom, dto.membreIds);
  }

  @Get('canaux/:id/membres')
  @UseGuards(AccesCanalGuard)
  membres(@Param('id') id: string) {
    return this.chat.membresGroupe(id);
  }

  @Post('canaux/:id/membres')
  @UseGuards(AccesCanalGuard)
  ajouterMembres(@Req() req: R, @Param('id') id: string, @Body() dto: AjouterMembresDto) {
    return this.chat.ajouterMembres(req.user, id, dto.membreIds);
  }

  @Delete('canaux/:id/membres/:utilisateurId')
  @CompteCommeLecture()
  @UseGuards(AccesCanalGuard)
  retirerMembre(@Req() req: R, @Param('id') id: string, @Param('utilisateurId') utilisateurId: string) {
    return this.chat.retirerMembre(req.user, id, utilisateurId);
  }

  @Patch('canaux/:id')
  @UseGuards(AccesCanalGuard)
  renommer(@Req() req: R, @Param('id') id: string, @Body() dto: RenommerGroupeDto) {
    return this.chat.renommerGroupe(req.user, id, dto.nom);
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
  // Fréquence bornée comme les notifications (audit du 23/11/2026) : un
  // onglet en demande un à chaque (re)connexion, pas des centaines.
  @Post('chat/ticket')
  @CompteCommeLecture()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ticket(@Req() req: R) {
    return {
      token: this.tickets.emettre({
        stream: 'chat',
        userId: req.user.userId,
        societeId: req.user.societeId,
        societeSlug: req.user.societeSlug,
        role: req.user.role,
      }),
    };
  }
}
