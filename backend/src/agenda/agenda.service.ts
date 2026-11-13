import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { addDays, daysBetween, ETAPE, formatDate, hasRight, LIBELLES_REPONSE, toIsoDay } from '@hub/domain';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ReponseInvitation } from '@prisma/client';
import { DemandesService } from '../rh/demandes.service';
import type { CreerRendezVousDto, ElementAgendaDto, ModifierRendezVousDto, SemaineAgendaDto } from './agenda.dto';
import { InvitationsAgendaService } from './invitations.service';
import { nomDe, quandRendezVous } from './liens';

export type Acteur = { userId: string; societeId: string; role: string; permissions?: Record<string, string> };

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
// Échéances, congés, demandes : rien à modifier, aucun invité.
const SANS_ACTION = {
  lienVisio: null,
  rappelMinutes: null,
  maReponse: null,
  participants: [],
  modifiable: false,
  entretien: false,
  jeSuisOrganisateur: false,
  description: null,
  inviteIds: [] as string[],
};
// Vue « Année » : jusqu'à 366 jours d'un coup.
const JOURS_MAX = 366;

// Agenda (lot 11, décision du 01/11/2026) : ses rendez-vous et réunions, plus
// — à la lecture, jamais copiés — les échéances de ses tâches et ses congés
// validés. Mon agenda : étape « agenda » ; inviter : « Réunions » ; voir celui
// d'un collègue : « Agenda des autres ». Vers l'agenda personnel (12/11/2026) :
// abonnement (abonnement.service.ts) et invitations par e-mail
// (invitations.service.ts), du HUB vers l'extérieur seulement.
@Injectable()
export class AgendaService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private demandes: DemandesService,
    private invitations: InvitationsAgendaService,
  ) {}

  // Une période (semaine, mois ou année, 01/11/2026) : `au` inclus, une
  // semaine par défaut.
  // `sansDemandes` : l'abonnement externe (abonnement.service.ts), où les
  // demandes d'absence à trancher ne sortent jamais du HUB.
  async semaine(
    a: Acteur,
    du: string,
    personneId?: string,
    auDemande?: string,
    options: { sansDemandes?: boolean } = {},
  ): Promise<SemaineAgendaDto> {
    if (!JOUR.test(du)) throw new BadRequestException('Date de début invalide (AAAA-MM-JJ).');
    const au = auDemande ?? addDays(du, 6);
    if (!JOUR.test(au) || au < du || daysBetween(du, au) >= JOURS_MAX) {
      throw new BadRequestException('Période invalide (366 jours au plus).');
    }
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
    // Un collègue : un membre de la société, pas n'importe quel compte du HUB.
    if (
      cible !== a.userId &&
      !(await this.prisma.utilisateurSocieteRole.count({ where: { societeId: a.societeId, utilisateurId: cible } }))
    ) {
      throw new NotFoundException('Personne introuvable');
    }
    const debut = new Date(`${du}T00:00:00Z`);
    const finExclue = new Date(`${addDays(au, 1)}T00:00:00Z`);
    const jours = daysBetween(du, au) + 1;

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
    const [utilisateurs, entretiens] = await Promise.all([
      this.prisma.utilisateur.findMany({
        where: { id: { in: comptes } },
        select: { id: true, prenom: true, nom: true },
      }),
      // Entretiens de recrutement : replanifiés depuis la candidature.
      rdv.length
        ? this.prisma.candidature.findMany({
            where: { rendezVousId: { in: rdv.map((r) => r.id) } },
            select: { rendezVousId: true },
          })
        : [],
    ]);
    const noms = new Map(utilisateurs.map((u) => [u.id, nomDe(u)]));
    const idsEntretiens = new Set(entretiens.map((c) => c.rendezVousId));
    const peutModifier = hasRight(a.permissions, ETAPE.agenda, 'ecriture');

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
        // Un entretien se replanifie et s'annule depuis sa candidature
        // (décision du 12/11/2026).
        annulable:
          r.organisateurId === a.userId &&
          hasRight(a.permissions, ETAPE.agenda, 'suppression') &&
          !idsEntretiens.has(r.id),
        modifiable: r.organisateurId === a.userId && peutModifier && !idsEntretiens.has(r.id),
        lienVisio: r.lienVisio,
        rappelMinutes: r.rappelMinutes,
        maReponse: r.invites.find((i) => i.utilisateurId === cible)?.reponse ?? null,
        participants: r.invites.map((i) => ({ nom: noms.get(i.utilisateurId) ?? '—', reponse: i.reponse })),
        entretien: idsEntretiens.has(r.id),
        jeSuisOrganisateur: r.organisateurId === cible,
        description: r.description,
        // Pour le formulaire de l'organisateur seulement.
        inviteIds: r.organisateurId === a.userId ? r.invites.map((i) => i.utilisateurId) : [],
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
        ...SANS_ACTION,
      })),
      // Un congé : un élément par jour de la période qu'il couvre.
      ...conges.flatMap((c) =>
        Array.from({ length: jours }, (_, i) => addDays(du, i))
          .filter((j) => j >= c.dateDebut && j <= c.dateFin)
          .map((j) => ({
            id: `${c.id}:${j}`,
            type: 'conge' as const,
            titre: 'Absence validée',
            jour: j,
            debut: null,
            fin: null,
            lieu: null,
            detail: `du ${formatDate(c.dateDebut)} au ${formatDate(c.dateFin)}`,
            organisateur: null,
            invites: [],
            annulable: false,
            ...SANS_ACTION,
          })),
      ),
      // Demandes d'absence qu'on doit trancher (son agenda seulement) : la
      // file « À valider » du N+1 (et de la validation finale du CEO).
      ...(cible === a.userId && !options.sansDemandes ? await this.demandesADecider(a, du, au, jours) : []),
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

  private async demandesADecider(a: Acteur, du: string, au: string, jours: number): Promise<ElementAgendaDto[]> {
    const file = await this.demandes.aValider(a);
    return file
      .filter((d) => d.dateDebut <= au && d.dateFin >= du)
      .flatMap((d) =>
        Array.from({ length: jours }, (_, i) => addDays(du, i))
          .filter((j) => j >= d.dateDebut && j <= d.dateFin)
          .map((j) => ({
            id: `${d.id}:${j}`,
            type: 'demande' as const,
            titre: `${d.salarie.prenom} ${d.salarie.nom}`,
            jour: j,
            debut: null,
            fin: null,
            lieu: null,
            detail: `du ${formatDate(d.dateDebut)} au ${formatDate(d.dateFin)}`,
            organisateur: null,
            invites: [],
            annulable: false,
            ...SANS_ACTION,
            demande: { id: d.id, type: d.type, jours: d.jours, validationFinale: d.validationFinale },
          })),
      );
  }

  async creer(a: Acteur, dto: CreerRendezVousDto) {
    const debut = new Date(dto.debut);
    const fin = new Date(dto.fin);
    if (!(fin > debut)) throw new BadRequestException('La fin doit suivre le début.');
    const inviteIds = [...new Set((dto.inviteIds ?? []).filter((id) => id !== a.userId))];
    if (inviteIds.length && !hasRight(a.permissions, ETAPE.agendaReunions, 'ecriture')) {
      throw new ForbiddenException('Inviter des collègues demande l’Écriture de « Réunions ».');
    }
    await this.verifierMembres(a, inviteIds);
    const r = await this.prisma.rendezVous.create({
      data: {
        societeId: a.societeId,
        titre: dto.titre.trim(),
        debut,
        fin,
        lieu: dto.lieu?.trim() || null,
        description: dto.description?.trim() || null,
        lienVisio: dto.lienVisio?.trim() || null,
        rappelMinutes: dto.rappelMinutes ?? null,
        organisateurId: a.userId,
        invites: { create: inviteIds.map((utilisateurId) => ({ utilisateurId })) },
      },
    });
    if (inviteIds.length) {
      await this.notifications.envoyer({
        societeId: a.societeId,
        type: 'rdv_invitation',
        titre: `Réunion · ${r.titre} · ${quandRendezVous(debut)}`,
        destinataireIds: inviteIds,
        parId: a.userId,
      });
      await this.invitations.envoyer(r.id, 'REQUEST');
    }
    return { id: r.id };
  }

  // Invités : des membres actifs de la société.
  private async verifierMembres(a: Acteur, ids: string[]) {
    if (!ids.length) return;
    const membres = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId: a.societeId, utilisateurId: { in: ids }, utilisateur: { actif: true } },
      select: { utilisateurId: true },
    });
    if (new Set(membres.map((m) => m.utilisateurId)).size !== ids.length) {
      throw new BadRequestException('Un invité n’est pas membre de la société.');
    }
  }

  // Modifier (12/11/2026) : l'organisateur seul, avec l'Écriture de « Mon
  // agenda » ; ajouter un invité demande celle de « Réunions » (en retirer,
  // non). Les invités gardés reçoivent la réunion à jour, les nouveaux
  // l'invitation, les retirés l'annulation — dans le HUB et par e-mail. Un
  // entretien de recrutement se replanifie depuis sa candidature.
  async modifier(a: Acteur, id: string, dto: ModifierRendezVousDto) {
    const r = await this.prisma.rendezVous.findFirst({
      where: { id, societeId: a.societeId, annuleLe: null },
      include: { invites: true },
    });
    if (!r) throw new NotFoundException('Rendez-vous introuvable');
    if (r.organisateurId !== a.userId) throw new ForbiddenException('Seul l’organisateur modifie ce rendez-vous.');
    if (await this.prisma.candidature.count({ where: { rendezVousId: id } })) {
      throw new ConflictException('Un entretien se replanifie depuis le recrutement.');
    }
    const debut = new Date(dto.debut);
    const fin = new Date(dto.fin);
    if (!(fin > debut)) throw new BadRequestException('La fin doit suivre le début.');

    const avant = new Set(r.invites.map((i) => i.utilisateurId));
    const apres = [...new Set(dto.inviteIds.filter((x) => x !== a.userId))];
    const ajoutes = apres.filter((x) => !avant.has(x));
    const gardes = apres.filter((x) => avant.has(x));
    const retires = [...avant].filter((x) => !apres.includes(x));
    if (ajoutes.length && !hasRight(a.permissions, ETAPE.agendaReunions, 'ecriture')) {
      throw new ForbiddenException('Inviter des collègues demande l’Écriture de « Réunions ».');
    }
    await this.verifierMembres(a, ajoutes);

    const donnees = {
      titre: dto.titre.trim(),
      debut,
      fin,
      lieu: dto.lieu?.trim() || null,
      description: dto.description?.trim() || null,
      lienVisio: dto.lienVisio?.trim() || null,
      rappelMinutes: dto.rappelMinutes ?? null,
    };
    // Le contenu (pas la liste des invités) : ce que les invités gardés
    // doivent apprendre ; retirer quelqu'un ne les dérange pas.
    const contenuChange =
      donnees.titre !== r.titre ||
      +donnees.debut !== +r.debut ||
      +donnees.fin !== +r.fin ||
      donnees.lieu !== r.lieu ||
      donnees.description !== r.description ||
      donnees.lienVisio !== r.lienVisio;
    // Le rappel ne regarde que l'organisateur : le changer seul ne dérange
    // pas les invités. Nouvelle heure ou nouveau rappel : il repartira.
    const rappelChange = donnees.rappelMinutes !== r.rappelMinutes;
    const rappelARefaire = +donnees.debut !== +r.debut || rappelChange;
    if (!contenuChange && !rappelChange && !ajoutes.length && !retires.length) return { ok: true };

    // Jamais une réunion annulée entre-temps (elle réapparaîtrait chez les
    // invités) ; deux modifications simultanées qui ajoutent la même personne
    // n'en créent qu'une ligne.
    await this.prisma.$transaction(async (tx) => {
      const maj = await tx.rendezVous.updateMany({
        where: { id, annuleLe: null },
        data: { ...donnees, sequence: { increment: 1 }, ...(rappelARefaire && { rappelEnvoyeLe: null }) },
      });
      if (!maj.count) throw new NotFoundException('Rendez-vous introuvable');
      await tx.inviteRendezVous.deleteMany({ where: { rendezVousId: id, utilisateurId: { in: retires } } });
      await tx.inviteRendezVous.createMany({
        data: ajoutes.map((utilisateurId) => ({ rendezVousId: id, utilisateurId })),
        skipDuplicates: true,
      });
    });

    const quand = quandRendezVous(debut);
    const prevenir = async (type: 'rdv_modifie' | 'rdv_invitation' | 'rdv_annule', titre: string, ids: string[]) => {
      if (ids.length) {
        await this.notifications.envoyer({
          societeId: a.societeId,
          type,
          titre,
          destinataireIds: ids,
          parId: a.userId,
        });
      }
    };
    if (contenuChange) await prevenir('rdv_modifie', `Réunion modifiée · ${donnees.titre} · ${quand}`, gardes);
    await prevenir('rdv_invitation', `Réunion · ${donnees.titre} · ${quand}`, ajoutes);
    await prevenir('rdv_annule', `Réunion annulée · ${r.titre} · ${quandRendezVous(r.debut)}`, retires);
    // La réunion à jour : à tous si son contenu change, sinon aux seuls ajoutés.
    const aJour = contenuChange ? apres : ajoutes;
    if (aJour.length) await this.invitations.envoyer(id, 'REQUEST', { destinataires: aJour });
    if (retires.length) await this.invitations.envoyer(id, 'CANCEL', { destinataires: retires });
    return { ok: true };
  }

  // Annuler : l'organisateur seul (circuit), avec la Suppression de « Mon agenda » ;
  // jamais un entretien de recrutement (depuis sa candidature).
  async annuler(a: Acteur, id: string) {
    const r = await this.prisma.rendezVous.findFirst({
      where: { id, societeId: a.societeId, annuleLe: null },
      include: { invites: true },
    });
    if (!r) throw new NotFoundException('Rendez-vous introuvable');
    if (r.organisateurId !== a.userId) throw new ForbiddenException('Seul l’organisateur annule ce rendez-vous.');
    if (await this.prisma.candidature.count({ where: { rendezVousId: id } })) {
      throw new ConflictException('Un entretien s’annule depuis le recrutement.');
    }
    await this.prisma.rendezVous.update({ where: { id }, data: { annuleLe: new Date(), sequence: { increment: 1 } } });
    if (r.invites.length) {
      await this.notifications.envoyer({
        societeId: a.societeId,
        type: 'rdv_annule',
        titre: `Réunion annulée · ${r.titre} · ${quandRendezVous(r.debut)}`,
        destinataireIds: r.invites.map((i) => i.utilisateurId),
        parId: a.userId,
      });
      await this.invitations.envoyer(id, 'CANCEL');
    }
    return { ok: true };
  }

  // Répondre à une invitation (12/11/2026) : l'invité seul, sur une réunion
  // à venir ou en cours, non annulée ; l'organisateur est prévenu d'un
  // changement de réponse.
  async repondre(a: Acteur, id: string, reponse: ReponseInvitation) {
    const r = await this.prisma.rendezVous.findFirst({
      where: { id, societeId: a.societeId, annuleLe: null },
      include: { invites: { where: { utilisateurId: a.userId } } },
    });
    const invite = r?.invites[0];
    if (!r || !invite) throw new NotFoundException('Invitation introuvable');
    if (r.fin <= new Date()) throw new ConflictException('Cette réunion est passée.');
    if (invite.reponse === reponse) return { ok: true };
    await this.prisma.inviteRendezVous.update({
      where: { rendezVousId_utilisateurId: { rendezVousId: id, utilisateurId: a.userId } },
      data: { reponse, reponduLe: new Date() },
    });
    const moi = await this.prisma.utilisateur.findUnique({
      where: { id: a.userId },
      select: { prenom: true, nom: true },
    });
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'rdv_reponse',
      titre: `${moi ? nomDe(moi) : 'Un invité'} · ${LIBELLES_REPONSE[reponse]} · ${r.titre} · ${quandRendezVous(r.debut)}`,
      destinataireIds: [r.organisateurId],
      parId: a.userId,
    });
    return { ok: true };
  }

  // Disponibilités au moment d'inviter (12/11/2026) : parmi les membres de la
  // société, qui a déjà un rendez-vous sur le créneau (organisé, ou accepté
  // sans l'avoir décliné) et qui est absent ce jour-là. Rien d'autre : ni
  // titre, ni lieu. Demande l'Écriture de « Réunions » (qui invite).
  // Seulement pour les personnes qu'on s'apprête à inviter (50 au plus), sur
  // un créneau d'hier à un an ; sans la Lecture de « Agenda des autres »,
  // une absence (donnée RH) se dit seulement « occupé ».
  async disponibilites(a: Acteur, debutIso: string, finIso: string, pour: string[], exclure?: string) {
    const debut = new Date(debutIso);
    const fin = new Date(finIso);
    const maintenant = Date.now();
    if (
      !(fin > debut) ||
      +fin - +debut > 7 * 86_400_000 ||
      +debut < maintenant - 86_400_000 ||
      +debut > maintenant + 366 * 86_400_000
    ) {
      throw new BadRequestException('Créneau invalide (sept jours au plus, d’hier à un an).');
    }
    if (!pour.length) return { occupes: [], absents: [] };
    const membres = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId: a.societeId, utilisateurId: { in: pour }, utilisateur: { actif: true } },
      select: { utilisateurId: true },
    });
    const ids = [...new Set(membres.map((m) => m.utilisateurId))];
    const [rdv, absences] = await Promise.all([
      this.prisma.rendezVous.findMany({
        where: {
          societeId: a.societeId,
          annuleLe: null,
          debut: { lt: fin },
          fin: { gt: debut },
          ...(exclure && { id: { not: exclure } }),
        },
        select: { organisateurId: true, invites: { select: { utilisateurId: true, reponse: true } } },
      }),
      this.prisma.demandeAbsence.findMany({
        where: {
          statut: 'validee',
          dateDebut: { lte: toIsoDay(new Date(+fin - 1)) },
          dateFin: { gte: toIsoDay(debut) },
          dossier: { utilisateurId: { in: ids } },
        },
        select: { dossier: { select: { utilisateurId: true } } },
      }),
    ]);
    const membresSet = new Set(ids);
    const occupes = new Set<string>();
    for (const r of rdv) {
      occupes.add(r.organisateurId);
      for (const i of r.invites) if (i.reponse !== 'non') occupes.add(i.utilisateurId);
    }
    const absents = new Set(absences.map((x) => x.dossier.utilisateurId).filter((x): x is string => !!x));
    if (!hasRight(a.permissions, ETAPE.agendaAutres, 'lecture')) {
      return { occupes: [...new Set([...occupes, ...absents])].filter((x) => membresSet.has(x)), absents: [] };
    }
    return {
      occupes: [...occupes].filter((x) => membresSet.has(x) && !absents.has(x)),
      absents: [...absents].filter((x) => membresSet.has(x)),
    };
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
