import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreerSignalementDto } from './dto';
import { ROLE_CIO } from '@hub/domain';

type Acteur = { userId: string; societeId: string; role: string };
const apercu = (texte: string) => (texte.length > 80 ? `${texte.slice(0, 77)}…` : texte);

// « Signaler un problème » : n'importe quel compte de la société dépose un
// retour ; le CIO (et l'administration de la société) le suit jusqu'à sa
// correction. Le HUB joint la page, le rôle et l'appareil.
@Injectable()
export class SignalementsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async creer(a: Acteur, dto: CreerSignalementDto) {
    const description = dto.description.trim();
    if (description.length < 10)
      throw new BadRequestException('Décrivez le problème en quelques mots (10 caractères au moins).');
    if (dto.capture && !/^data:image\//.test(dto.capture))
      throw new BadRequestException('La capture doit être une image.');
    const s = await this.prisma.signalement.create({
      data: {
        societeId: a.societeId,
        auteurId: a.userId,
        description,
        page: dto.page.trim() || '/',
        role: a.role,
        appareil: dto.appareil,
        capture: dto.capture ?? null,
      },
      select: { id: true },
    });
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'signalement_recu',
      titre: `Problème signalé · ${apercu(description)}`,
      destinataireIds: await this.notifications.titulairesRole(a.societeId, ROLE_CIO),
      parId: a.userId,
    });
    return { id: s.id };
  }

  async lister(societeId: string) {
    const l = await this.prisma.signalement.findMany({
      where: { societeId },
      orderBy: { creeLe: 'desc' },
      select: {
        id: true,
        description: true,
        page: true,
        role: true,
        appareil: true,
        statut: true,
        creeLe: true,
        traiteLe: true,
        auteur: { select: { prenom: true, nom: true } },
      },
    });
    const avecCapture = new Set(
      (
        await this.prisma.signalement.findMany({ where: { societeId, capture: { not: null } }, select: { id: true } })
      ).map((x) => x.id),
    );
    return l.map(({ auteur, ...s }) => ({
      ...s,
      auteur: auteur ? `${auteur.prenom} ${auteur.nom}` : null,
      aCapture: avecCapture.has(s.id),
    }));
  }

  async capture(societeId: string, id: string) {
    const s = await this.prisma.signalement.findFirst({ where: { id, societeId }, select: { capture: true } });
    if (!s?.capture) throw new NotFoundException('Capture introuvable');
    return { nom: `signalement-${id.slice(0, 8)}.png`, url: s.capture };
  }

  async changerStatut(a: Acteur, id: string, statut: 'a_traiter' | 'en_cours' | 'corrige') {
    const { count } = await this.prisma.signalement.updateMany({
      where: { id, societeId: a.societeId },
      data: {
        statut,
        traiteLe: statut === 'a_traiter' ? null : new Date(),
        traiteParId: statut === 'a_traiter' ? null : a.userId,
      },
    });
    if (!count) throw new NotFoundException('Signalement introuvable');
    return this.lister(a.societeId);
  }
}
