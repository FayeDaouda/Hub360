import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { addDays, ETAPE, hasRight, toIsoDay } from '@hub/domain';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreerRendezVousDto, ElementAgendaDto, SemaineAgendaDto } from './agenda.dto';

type Acteur = { userId: string; societeId: string; role: string; permissions?: Record<string, string> };

const nomDe = (u: { prenom: string; nom: string }) => `${u.prenom} ${u.nom}`.trim();
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

// Agenda (lot 11, décision du 01/11/2026) : ses rendez-vous et réunions, plus
// — à la lecture, jamais copiés — les échéances de ses tâches et ses congés
// validés. Mon agenda : étape « agenda » ; inviter : « Réunions » ; voir celui
// d'un collègue : « Agenda des autres ». Pas de synchronisation externe (v1).
@Injectable()
export class AgendaService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async semaine(a: Acteur, du: string, personneId?: string): Promise<SemaineAgendaDto> {
    if (!JOUR.test(du)) throw new BadRequestException('Date de début invalide (AAAA-MM-JJ).');
    const cible = personneId ?? a.userId;
    const peutVoirAutres = hasRight(a.permissions, ETAPE.agendaAutres, 'lecture');
    if (cible !== a.userId && !peutVoirAutres) {
      throw new ForbiddenException('Voir l’agenda d’un collègue demande la Lecture de « Agenda des autres ».');
    }
    const personne = await this.prisma.utilisateur.findUnique({
      where: { id: cible },
      select: { id: true, prenom: true, nom: true },
    });
    if (!personne) throw new NotFoundException('Personne introuvable');
    const au = addDays(du, 6);
    const debut = new Date(`${du}T00:00:00Z`);
    const finExclue = new Date(`${addDays(du, 7)}T00:00:00Z`);

    const [rdv, taches, conges] = await Promise.all([
      this.prisma.rendezVous.findMany({
        where: {
          societeId: a.societeId,
          annuleLe: null,
          debut: { lt: finExclue },
          fin: { gte: debut },
          OR: [{ organisateurId: cible }, { invites: { some: { utilisateurId: cible } } }],
        },
        include: { invites: true },
        orderBy: { debut: 'asc' },
      }),
      this.prisma.tacheProjet.findMany({
        where: {
          finLe: { gte: du, lte: au },
          statut: { notIn: ['validee', 'non_necessaire'] },
          projet: { societeId: a.societeId },
          assigne: { OR: [{ utilisateurId: cible }, { dossierPersonnel: { utilisateurId: cible } }] },
        },
        select: { id: true, libelle: true, finLe: true, projet: { select: { code: true } } },
      }),
      this.prisma.demandeAbsence.findMany({
        where: {
          statut: 'validee',
          dateDebut: { lte: au },
          dateFin: { gte: du },
          dossier: { utilisateurId: cible },
        },
        select: { id: true, type: true, dateDebut: true, dateFin: true },
      }),
    ]);

    const comptes = [...new Set(rdv.flatMap((r) => [r.organisateurId, ...r.invites.map((i) => i.utilisateurId)]))];
    const noms = new Map(
      (
        await this.prisma.utilisateur.findMany({
          where: { id: { in: comptes } },
          select: { id: true, prenom: true, nom: true },
        })
      ).map((u) => [u.id, nomDe(u)]),
    );

    const elements: ElementAgendaDto[] = [
      ...rdv.map((r) => ({
        id: r.id,
        type: 'rendez_vous' as const,
        titre: r.titre,
        jour: toIsoDay(r.debut),
        debut: r.debut.toISOString(),
        fin: r.fin.toISOString(),
        lieu: r.lieu,
        detail: r.description,
        organisateur: noms.get(r.organisateurId) ?? null,
        invites: r.invites.map((i) => noms.get(i.utilisateurId) ?? '—'),
        annulable: r.organisateurId === a.userId && hasRight(a.permissions, ETAPE.agenda, 'suppression'),
      })),
      ...taches.map((t) => ({
        id: t.id,
        type: 'echeance' as const,
        titre: t.libelle,
        jour: t.finLe!,
        debut: null,
        fin: null,
        lieu: null,
        detail: `Échéance · ${t.projet.code}`,
        organisateur: null,
        invites: [],
        annulable: false,
      })),
      // Un congé : un élément par jour de la semaine qu'il couvre.
      ...conges.flatMap((c) =>
        Array.from({ length: 7 }, (_, i) => addDays(du, i))
          .filter((j) => j >= c.dateDebut && j <= c.dateFin)
          .map((j) => ({
            id: `${c.id}:${j}`,
            type: 'conge' as const,
            titre: 'Absence validée',
            jour: j,
            debut: null,
            fin: null,
            lieu: null,
            detail: `du ${c.dateDebut} au ${c.dateFin}`,
            organisateur: null,
            invites: [],
            annulable: false,
          })),
      ),
    ].sort((x, y) => x.jour.localeCompare(y.jour) || (x.debut ?? '').localeCompare(y.debut ?? ''));

    return {
      du,
      au,
      personne: { id: personne.id, nom: nomDe(personne) },
      elements,
      peutVoirAutres,
      peutCreer: hasRight(a.permissions, ETAPE.agenda, 'ecriture'),
      peutInviter: hasRight(a.permissions, ETAPE.agendaReunions, 'ecriture'),
    };
  }

  async creer(a: Acteur, dto: CreerRendezVousDto) {
    const debut = new Date(dto.debut);
    const fin = new Date(dto.fin);
    if (!(fin > debut)) throw new BadRequestException('La fin doit suivre le début.');
    const inviteIds = [...new Set((dto.inviteIds ?? []).filter((id) => id !== a.userId))];
    if (inviteIds.length && !hasRight(a.permissions, ETAPE.agendaReunions, 'ecriture')) {
      throw new ForbiddenException('Inviter des collègues demande l’Écriture de « Réunions ».');
    }
    // Invités : des membres actifs de la société.
    const membres = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId: a.societeId, utilisateurId: { in: inviteIds }, utilisateur: { actif: true } },
      select: { utilisateurId: true },
    });
    if (new Set(membres.map((m) => m.utilisateurId)).size !== inviteIds.length) {
      throw new BadRequestException('Un invité n’est pas membre de la société.');
    }
    const r = await this.prisma.rendezVous.create({
      data: {
        societeId: a.societeId,
        titre: dto.titre.trim(),
        debut,
        fin,
        lieu: dto.lieu?.trim() || null,
        description: dto.description?.trim() || null,
        organisateurId: a.userId,
        invites: { create: inviteIds.map((utilisateurId) => ({ utilisateurId })) },
      },
    });
    if (inviteIds.length) {
      await this.notifications.envoyer({
        societeId: a.societeId,
        type: 'rdv_invitation',
        titre: `Réunion · ${r.titre} · le ${toIsoDay(debut)} à ${debut.toISOString().slice(11, 16)}`,
        destinataireIds: inviteIds,
        parId: a.userId,
      });
    }
    return { id: r.id };
  }

  // Annuler : l'organisateur seul (circuit), avec la Suppression de « Mon agenda ».
  async annuler(a: Acteur, id: string) {
    const r = await this.prisma.rendezVous.findFirst({
      where: { id, societeId: a.societeId, annuleLe: null },
      include: { invites: true },
    });
    if (!r) throw new NotFoundException('Rendez-vous introuvable');
    if (r.organisateurId !== a.userId) throw new ForbiddenException('Seul l’organisateur annule ce rendez-vous.');
    await this.prisma.rendezVous.update({ where: { id }, data: { annuleLe: new Date() } });
    if (r.invites.length) {
      await this.notifications.envoyer({
        societeId: a.societeId,
        type: 'rdv_annule',
        titre: `Réunion annulée · ${r.titre} · le ${toIsoDay(r.debut)}`,
        destinataireIds: r.invites.map((i) => i.utilisateurId),
        parId: a.userId,
      });
    }
    return { ok: true };
  }

  // Collègues de la société (invitations, agenda des autres).
  async personnes(a: Acteur) {
    const lignes = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId: a.societeId, utilisateur: { actif: true } },
      select: { utilisateur: { select: { id: true, prenom: true, nom: true } } },
    });
    const vus = new Map(lignes.map((l) => [l.utilisateur.id, nomDe(l.utilisateur)]));
    return [...vus].map(([id, nom]) => ({ id, nom })).sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
  }
}
