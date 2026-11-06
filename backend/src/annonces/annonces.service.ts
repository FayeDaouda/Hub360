import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Annonce } from '@prisma/client';
import { ETAPE, hasRight } from '@hub/domain';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { runInGroupScope } from '../tenancy/tenant-context';
import type { AnnonceDto, CreerAnnonceDto, VueAnnoncesDto } from './annonces.dto';

type Acteur = { userId: string; societeId: string; role: string; permissions?: Record<string, string> };

const nomDe = (u: { prenom: string; nom: string }) => `${u.prenom} ${u.nom}`.trim();
const peut = (a: Acteur, droit: 'lecture' | 'ecriture' | 'validation' | 'suppression') =>
  hasRight(a.permissions, ETAPE.annonces, droit);

// Annonces (lot 12, décision du 01/11/2026) : à la société, à tout le groupe
// ou à une équipe. Qui a la Validation de l'étape publie directement (au
// départ, toute la direction) ; sinon l'annonce attend qu'un validateur la
// publie. « Importante » : chaque destinataire est prévenu et dit « Lu ».
@Injectable()
export class AnnoncesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async vue(a: Acteur): Promise<VueAnnoncesDto> {
    const cellule = await this.celluleDe(a);
    // Le groupe traverse les sociétés : lecture transverse (ADR 0001).
    const publiees = await runInGroupScope(() =>
      this.prisma.annonce.findMany({
        where: {
          statut: 'publiee',
          OR: [
            { audience: 'societe', societeId: a.societeId },
            { audience: 'groupe' },
            ...(cellule ? [{ audience: 'equipe' as const, celluleId: cellule }] : []),
          ],
        },
        include: { lectures: true, societe: { select: { nom: true } } },
        orderBy: { publieeLe: 'desc' },
        take: 100,
      }),
    );
    const aValider = peut(a, 'validation')
      ? await this.prisma.annonce.findMany({
          where: { societeId: a.societeId, statut: 'a_valider' },
          include: { lectures: true, societe: { select: { nom: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const equipes = await this.prisma.cellule.findMany({
      where: { societeId: a.societeId },
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' },
    });
    const noms = await this.noms([...publiees, ...aValider].map((x) => x.auteurId));
    const equipesNoms = new Map(equipes.map((e) => [e.id, e.nom]));
    const vers = (x: Annonce & { lectures: { utilisateurId: string }[]; societe: { nom: string } }): AnnonceDto => ({
      id: x.id,
      titre: x.titre,
      contenu: x.contenu,
      audience: x.audience,
      destinataires:
        x.audience === 'groupe'
          ? 'Tout le groupe'
          : x.audience === 'equipe'
            ? `Équipe ${equipesNoms.get(x.celluleId ?? '') ?? ''}`.trim()
            : x.societe.nom,
      importante: x.importante,
      statut: x.statut,
      auteur: noms.get(x.auteurId) ?? '—',
      societe: x.societe.nom,
      publieeLe: x.publieeLe?.toISOString() ?? null,
      lue: x.lectures.some((l) => l.utilisateurId === a.userId),
      lectures: x.importante && (x.auteurId === a.userId || peut(a, 'validation')) ? x.lectures.length : null,
      peutRetirer: x.societeId === a.societeId && x.statut === 'publiee' && peut(a, 'suppression'),
    });
    return {
      annonces: publiees.map(vers),
      aValider: aValider.map(vers),
      peutRediger: peut(a, 'ecriture'),
      publieDirectement: peut(a, 'validation'),
      equipes,
    };
  }

  async creer(a: Acteur, dto: CreerAnnonceDto) {
    if (dto.audience === 'equipe') {
      const cellule = await this.prisma.cellule.findFirst({ where: { id: dto.celluleId, societeId: a.societeId } });
      if (!cellule) throw new BadRequestException('Équipe introuvable dans la société.');
    }
    const direct = peut(a, 'validation');
    const annonce = await this.prisma.annonce.create({
      data: {
        societeId: a.societeId,
        titre: dto.titre.trim(),
        contenu: dto.contenu.trim(),
        audience: dto.audience,
        celluleId: dto.audience === 'equipe' ? dto.celluleId! : null,
        importante: !!dto.importante,
        statut: direct ? 'publiee' : 'a_valider',
        auteurId: a.userId,
        publieeLe: direct ? new Date() : null,
        valideeParId: direct ? a.userId : null,
      },
    });
    if (direct) await this.prevenir(annonce, a.userId);
    else await this.demanderValidation(annonce, a.userId);
    return { id: annonce.id, statut: annonce.statut };
  }

  async valider(a: Acteur, id: string) {
    const x = await this.prisma.annonce.findFirst({ where: { id, societeId: a.societeId } });
    if (!x) throw new NotFoundException('Annonce introuvable');
    if (x.statut !== 'a_valider') throw new ConflictException('Cette annonce n’attend pas de validation.');
    const maj = await this.prisma.annonce.update({
      where: { id },
      data: { statut: 'publiee', publieeLe: new Date(), valideeParId: a.userId },
    });
    await this.prevenir(maj, a.userId);
    return { ok: true };
  }

  async retirer(a: Acteur, id: string) {
    const x = await this.prisma.annonce.findFirst({ where: { id, societeId: a.societeId } });
    if (!x) throw new NotFoundException('Annonce introuvable');
    if (x.statut === 'retiree') throw new ConflictException('Annonce déjà retirée.');
    await this.prisma.annonce.update({ where: { id }, data: { statut: 'retiree', retireeLe: new Date() } });
    return { ok: true };
  }

  // « Lu » : une annonce publiée que la personne peut lire.
  async lire(a: Acteur, id: string) {
    const visible = (await this.vue(a)).annonces.some((x) => x.id === id);
    if (!visible) throw new ForbiddenException('Cette annonce ne vous est pas adressée.');
    await runInGroupScope(() =>
      this.prisma.lectureAnnonce.upsert({
        where: { annonceId_utilisateurId: { annonceId: id, utilisateurId: a.userId } },
        update: {},
        create: { annonceId: id, utilisateurId: a.userId },
      }),
    );
    return { ok: true };
  }

  // Annonce importante publiée : chaque destinataire est prévenu, dans la
  // société où il travaille.
  private async prevenir(x: Annonce, parId: string) {
    if (!x.importante) return;
    // Le groupe : les membres de toutes les sociétés ; sinon ceux de la société.
    const affectations = await runInGroupScope(() =>
      this.prisma.utilisateurSocieteRole.findMany({
        where: { societeId: x.audience === 'groupe' ? { not: null } : x.societeId, utilisateur: { actif: true } },
        select: { utilisateurId: true, societeId: true },
      }),
    );
    let personnes = affectations;
    if (x.audience === 'equipe') {
      const membres = await this.prisma.collaborateur.findMany({
        where: { societeId: x.societeId, celluleId: x.celluleId },
        select: { utilisateurId: true, dossierPersonnel: { select: { utilisateurId: true } } },
      });
      const ids = new Set(membres.flatMap((m) => [m.utilisateurId, m.dossierPersonnel?.utilisateurId]).filter(Boolean));
      personnes = affectations.filter((p) => ids.has(p.utilisateurId));
    }
    const parSociete = new Map<string, string[]>();
    for (const p of personnes) {
      const s = p.societeId ?? x.societeId;
      parSociete.set(s, [...(parSociete.get(s) ?? []), p.utilisateurId]);
    }
    for (const [societeId, ids] of parSociete) {
      await this.notifications.envoyer({
        societeId,
        type: 'annonce_importante',
        titre: `Annonce importante · ${x.titre}`,
        destinataireIds: ids,
        parId,
      });
    }
  }

  // Annonce à valider : les titulaires d'un rôle qui a la Validation de l'étape.
  private async demanderValidation(x: Annonce, parId: string) {
    const roles = await this.prisma.roleRight.findMany({
      where: { validation: true, etape: { cle: ETAPE.annonces } },
      select: { roleId: true },
    });
    const affectations = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId: x.societeId, roleId: { in: roles.map((r) => r.roleId) }, utilisateur: { actif: true } },
      select: { utilisateurId: true },
    });
    await this.notifications.envoyer({
      societeId: x.societeId,
      type: 'annonce_a_valider',
      titre: `Annonce à valider · ${x.titre}`,
      destinataireIds: affectations.map((p) => p.utilisateurId),
      parId,
    });
  }

  private async celluleDe(a: Acteur): Promise<string | null> {
    const c = await this.prisma.collaborateur.findFirst({
      where: {
        societeId: a.societeId,
        OR: [{ utilisateurId: a.userId }, { dossierPersonnel: { utilisateurId: a.userId } }],
      },
      select: { celluleId: true },
    });
    return c?.celluleId ?? null;
  }

  private async noms(ids: string[]) {
    const u = await this.prisma.utilisateur.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, prenom: true, nom: true },
    });
    return new Map(u.map((x) => [x.id, nomDe(x)]));
  }
}
