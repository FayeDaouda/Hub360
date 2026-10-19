import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { ContactsService } from './contacts.service';

// Fiche contact d'un collègue : l'annuaire de la société, ouvert à tout
// compte du back-office (hors matrice, comme la recherche) — le service ne
// renvoie que les champs d'annuaire.
@Controller('societes/:slug/contacts')
@UseGuards(JwtAuthGuard, BackOfficeGuard)
export class ContactsController {
  constructor(private contacts: ContactsService) {}

  @Get(':utilisateurId')
  fiche(@Req() req: { user: { societeId: string } }, @Param('utilisateurId', ParseUUIDPipe) utilisateurId: string) {
    return this.contacts.fiche(req.user.societeId, utilisateurId);
  }
}
