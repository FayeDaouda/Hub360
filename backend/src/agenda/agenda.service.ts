import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDays,
  daysBetween,
  describeRecurrence,
  ETAPE,
  formatDate,
  hasRight,
  LIBELLES_REPONSE,
  alignRecurrence,
  expandOccurrences,
  formatRRule,
  parseRRule,
  toIsoDay,
} from '@hub/domain';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ExceptionRendezVous, ReponseInvitation } from '@prisma/client';
import { DemandesService } from '../rh/demandes.service';
import type {
  CreerRendezVousDto,
  ElementAgendaDto,
  ModifierRendezVousDto,
  Portee,
  SemaineAgendaDto,
} from './agenda.dto';
import { InvitationsAgendaService } from './invitations.service';
import { nomDe, quandRendezVous } from './liens';
import { estOccurrence, finDeSerie, finSerieAvecExceptions, occurrencesDans } from './series';

export type Acteur = { userId: string; societeId: string; role: string; permissions?: Record<string, string> };

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const JOUR_MS = 86_400_000;

// La règle et la fin de la dernière occurrence, toujours écrites ensemble.
const avecFinSerie = (debut: Date, fin: Date, regle: string | null) => ({
  regle,
  finSerie: finDeSerie(debut, fin, regle),
});
type SerieLue = {
  id: string;
  titre: string;
  debut: Date;
  fin: Date;
  lieu: string | null;
  description: string | null;
  lienVisio: string | null;
  regle: string | null;
  invites: { utilisateurId: string; reponse: ReponseInvitation | null; reponduLe: Date | null }[];
  exceptions: ExceptionRendezVous[];
};

// Prochaine occurrence d'une série à venir (texte des notifications).
const prochaine = (r: Omit<SerieLue, 'id' | 'invites'>): Date | null =>
  occurrencesDans(r, new Date(), new Date(Date.UTC(9999, 0, 1)))[0]?.debut ?? null;

// Règle reçue (16/11/2026) : relue avec @hub/domain (refusée si elle sort du
// sous-ensemble), recalée sur le premier rendez-vous (qui en est toujours la
// première occurrence, RFC 5545 — comme Google Agenda), écrite sous sa forme
// normale. Une fin à une date : entre le premier rendez-vous et cinq ans plus
// tard (sans fin, la série est permise). undefined : inchangée ; null : aucune.
function regleValide(regle: string | null | undefined, debut: Date): string | null | undefined {
  if (regle === undefined) return undefined;
  if (regle === null || !regle.trim()) return null;
  let r;
  try {
    r = parseRRule(regle);
  } catch (e) {
    throw new BadRequestException(`Répétition invalide : ${e instanceof Error ? e.message : e}`);
  }
  const premier = toIsoDay(debut);
  if (r.until && r.until < premier) throw new BadRequestException('La répétition finit avant le premier rendez-vous.');
  if (r.until && r.until > addDays(premier, 5 * 366)) throw new BadRequestException('Cinq ans de répétition au plus.');
  return formatRRule(alignRecurrence(r, debut.toISOString()));
}

// L'occurrence visée : un début que la règle donne vraiment.
function occurrenceValide(r: { debut: Date; regle: string | null }, occurrence?: string): Date {
  const occ = occurrence ? new Date(occurrence) : null;
  if (!occ || Number.isNaN(+occ) || !estOccurrence(r, occ)) {
    throw new BadRequestException('Occurrence introuvable dans cette série.');
  }
  return occ;
}

// La série qui s'arrête la veille de `occ` (fin à une date, plus de nombre).
function regleTronquee(regle: string, occ: Date): string {
  return formatRRule({ ...parseRRule(regle), count: undefined, until: toIsoDay(new Date(+occ - JOUR_MS)) });
}

// Échéances, congés, demandes : rien à modifier, aucun invité.
const SANS_ACTION = {
  serieId: null,
  occurrence: null,
  regle: null,
  regleTexte: null,
  occurrenceModifiee: false,
  serie: null,
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
          // Qui touche encore la période : sa dernière occurrence finit après
          // son début (ou série sans fin) ; les occurrences sont déroulées plus bas.
          AND: [
            { OR: [{ finSerie: null }, { finSerie: { gte: debut } }] },
            { OR: [{ regle: { not: null } }, { fin: { gte: debut } }] },
            { OR: [{ organisateurId: cible }, { invites: { some: { utilisateurId: cible } } }] },
          ],
        },
        include: { invites: true, exceptions: true },
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
      // Une série : un élément par occurrence de la période, identifié par
      // « série:début d'origine » ; les actions visent la série (serieId).
      ...rdv.flatMap((r) =>
        occurrencesDans(r, debut, finExclue).map((o) => ({
          id: o.occurrence ? `${r.id}:${o.occurrence.toISOString()}` : r.id,
          serieId: o.occurrence ? r.id : null,
          occurrence: o.occurrence?.toISOString() ?? null,
          regle: r.regle,
          regleTexte: r.regle ? describeRecurrence(parseRRule(r.regle), r.debut.toISOString()) : null,
          occurrenceModifiee: o.modifiee,
          serie: o.occurrence
            ? {
                debut: r.debut.toISOString(),
                fin: r.fin.toISOString(),
                titre: r.titre,
                lieu: r.lieu,
                description: r.description,
                lienVisio: r.lienVisio,
              }
            : null,
          type: 'rendez_vous' as const,
          titre: o.titre,
          jour: toIsoDay(o.debut),
          debut: o.debut.toISOString(),
          fin: o.fin.toISOString(),
          lieu: o.lieu,
          detail: o.description,
          organisateur: noms.get(r.organisateurId) ?? null,
          invites: r.invites.map((i) => noms.get(i.utilisateurId) ?? '—'),
          // Un entretien se replanifie et s'annule depuis sa candidature
          // (décision du 12/11/2026).
          annulable:
            r.organisateurId === a.userId &&
            hasRight(a.permissions, ETAPE.agenda, 'suppression') &&
            !idsEntretiens.has(r.id),
          modifiable: r.organisateurId === a.userId && peutModifier && !idsEntretiens.has(r.id),
          lienVisio: o.lienVisio,
          rappelMinutes: r.rappelMinutes,
          maReponse: r.invites.find((i) => i.utilisateurId === cible)?.reponse ?? null,
          participants: r.invites.map((i) => ({ nom: noms.get(i.utilisateurId) ?? '—', reponse: i.reponse })),
          entretien: idsEntretiens.has(r.id),
          jeSuisOrganisateur: r.organisateurId === cible,
          description: o.description,
          // Pour le formulaire de l'organisateur seulement.
          inviteIds: r.organisateurId === a.userId ? r.invites.map((i) => i.utilisateurId) : [],
        })),
      ),
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
        ...avecFinSerie(debut, fin, regleValide(dto.regle, debut) ?? null),
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
      include: { invites: true, exceptions: true },
    });
    if (!r) throw new NotFoundException('Rendez-vous introuvable');
    if (r.organisateurId !== a.userId) throw new ForbiddenException('Seul l’organisateur modifie ce rendez-vous.');
    if (await this.prisma.candidature.count({ where: { rendezVousId: id } })) {
      throw new ConflictException('Un entretien se replanifie depuis le recrutement.');
    }
    // Série (16/11/2026) : cette occurrence, ou celle-ci et les suivantes ;
    // sinon (ou « toutes ») la série entière, comme un rendez-vous unique.
    // Une série sans portée : on ne devine pas (rebaser la série sur la date
    // d'une occurrence en effacerait le passé).
    if (r.regle && !dto.portee)
      throw new BadRequestException('Précisez la portée : cet événement, les suivants ou tous.');
    if (r.regle && dto.portee && dto.portee !== 'toutes') {
      const occ = occurrenceValide(r, dto.occurrence);
      if (dto.portee === 'occurrence') return this.modifierOccurrence(a, r, occ, dto);
      if (+occ !== +r.debut) return this.modifierSuivantes(a, r, occ, dto);
    }
    // Toute la série : l'écran envoie ses valeurs à elle (premier rendez-vous,
    // titre, lieu…), jamais celles d'une occurrence.
    const debut = new Date(dto.debut);
    const fin = new Date(dto.fin);
    if (!(fin > debut)) throw new BadRequestException('La fin doit suivre le début.');
    const regle = regleValide(dto.regle === undefined ? r.regle : dto.regle, debut) ?? null;

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
      ...avecFinSerie(debut, fin, regle),
    };
    // Le contenu (pas la liste des invités) : ce que les invités gardés
    // doivent apprendre ; retirer quelqu'un ne les dérange pas.
    const contenuChange =
      donnees.titre !== r.titre ||
      +donnees.debut !== +r.debut ||
      +donnees.fin !== +r.fin ||
      donnees.lieu !== r.lieu ||
      donnees.description !== r.description ||
      donnees.lienVisio !== r.lienVisio ||
      donnees.regle !== (r.regle ?? null);
    // Nouvelle règle ou nouveau jour : les occurrences ne sont plus les mêmes,
    // leurs exceptions tombent (comme Google). Nouvelle heure seule : les
    // dates annulées le restent, décalées d'autant ; les modifiées tombent.
    const regleOuJourChange = !!r.regle && (donnees.regle !== r.regle || toIsoDay(donnees.debut) !== toIsoDay(r.debut));
    const heureChange = !!r.regle && !regleOuJourChange && +donnees.debut !== +r.debut;
    const decalage = +donnees.debut - +r.debut;
    const annuleesGardees = heureChange
      ? (r.exceptions ?? [])
          .filter((e) => e.annulee)
          .map((e) => ({ rendezVousId: id, occurrence: new Date(+e.occurrence + decalage), annulee: true }))
      : [];
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
      if (regleOuJourChange || heureChange) {
        await tx.exceptionRendezVous.deleteMany({ where: { rendezVousId: id } });
        await tx.rappelOccurrence.deleteMany({ where: { rendezVousId: id } });
        if (annuleesGardees.length) await tx.exceptionRendezVous.createMany({ data: annuleesGardees });
      }
      await tx.inviteRendezVous.deleteMany({ where: { rendezVousId: id, utilisateurId: { in: retires } } });
      await tx.inviteRendezVous.createMany({
        data: ajoutes.map((utilisateurId) => ({ rendezVousId: id, utilisateurId })),
        skipDuplicates: true,
      });
    });

    // Une série : sa prochaine date ; sinon la date du rendez-vous.
    const aVenir = regle ? prochaine({ ...r, ...donnees, exceptions: [] }) : null;
    const quand = aVenir ? `à partir du ${quandRendezVous(aVenir)}` : quandRendezVous(debut);
    if (contenuChange) await this.prevenir(a, 'rdv_modifie', `Réunion modifiée · ${donnees.titre} · ${quand}`, gardes);
    await this.prevenir(a, 'rdv_invitation', `Réunion · ${donnees.titre} · ${quand}`, ajoutes);
    // Les retirés : la date qu'ils avaient (la prochaine, pour une série).
    const quandAvant = r.regle ? quand : quandRendezVous(r.debut);
    await this.prevenir(a, 'rdv_annule', `Réunion annulée · ${r.titre} · ${quandAvant}`, retires);
    // La réunion à jour : à tous si son contenu change, sinon aux seuls ajoutés.
    const aJour = contenuChange ? apres : ajoutes;
    if (aJour.length) await this.invitations.envoyer(id, 'REQUEST', { destinataires: aJour });
    if (retires.length) await this.invitations.envoyer(id, 'CANCEL', { destinataires: retires });
    return { ok: true };
  }

  // Une occurrence seule (16/11/2026) : ses heures, titre, lieu, note, visio
  // ; les invités, eux, se changent pour toute la série.
  private async modifierOccurrence(a: Acteur, r: SerieLue, occ: Date, dto: ModifierRendezVousDto) {
    const debut = new Date(dto.debut);
    const fin = new Date(dto.fin);
    if (!(fin > debut)) throw new BadRequestException('La fin doit suivre le début.');
    const actuels = r.invites.map((i) => i.utilisateurId).sort();
    const demandes = [...new Set(dto.inviteIds.filter((x) => x !== a.userId))].sort();
    if (actuels.join(',') !== demandes.join(',')) {
      throw new BadRequestException('Les invités se changent pour toute la série.');
    }
    // Seulement ce qui diffère de la série : une modification ultérieure de
    // toute la série s'applique encore aux autres champs de cette date. Un
    // champ vidé pour cette seule date s'écrit « '' » (null : celui de la série).
    const propre = (v: string | null | undefined, serie: string | null) => {
      const x = v?.trim() || null;
      return x === serie ? null : (x ?? '');
    };
    const titre = dto.titre.trim();
    const origineFin = new Date(+occ + (+r.fin - +r.debut));
    const champs = {
      titre: titre === r.titre ? null : titre,
      debut: +debut === +occ ? null : debut,
      // Début déplacé : la fin aussi, toujours (sinon une durée changée plus
      // tard pour toute la série la mettrait avant le début).
      fin: +debut === +occ && +fin === +origineFin ? null : fin,
      lieu: propre(dto.lieu, r.lieu),
      description: propre(dto.description, r.description),
      lienVisio: propre(dto.lienVisio, r.lienVisio),
    };
    const avant = r.exceptions.find((e) => +e.occurrence === +occ);
    const debutAvant = avant?.debut ?? occ;
    await this.prisma.$transaction(async (tx) => {
      const maj = await tx.rendezVous.updateMany({
        where: { id: r.id, annuleLe: null },
        data: { sequence: { increment: 1 } },
      });
      if (!maj.count) throw new NotFoundException('Rendez-vous introuvable');
      await tx.exceptionRendezVous.upsert({
        where: { rendezVousId_occurrence: { rendezVousId: r.id, occurrence: occ } },
        create: { rendezVousId: r.id, occurrence: occ, ...champs },
        update: { annulee: false, ...champs },
      });
      // Déplacée après la dernière occurrence : la série va jusque-là.
      const exceptions = [
        ...r.exceptions.filter((e) => +e.occurrence !== +occ),
        { occurrence: occ, annulee: false, debut: champs.debut, fin: champs.fin },
      ];
      await tx.rendezVous.update({
        where: { id: r.id },
        data: { finSerie: finSerieAvecExceptions(r.debut, r.fin, r.regle, exceptions) },
      });
      // Nouvelle heure : son rappel repartira.
      if (+debut !== +debutAvant) {
        await tx.rappelOccurrence.deleteMany({ where: { rendezVousId: r.id, occurrence: occ } });
      }
    });
    await this.prevenir(
      a,
      'rdv_modifie',
      `Réunion modifiée · ${titre} · ${quandRendezVous(debut)} (cette date seulement)`,
      actuels,
    );
    if (actuels.length) await this.invitations.envoyer(r.id, 'REQUEST');
    return { ok: true };
  }

  // Celle-ci et les suivantes (16/11/2026) : la série s'arrête la veille ;
  // une nouvelle série part de cette occurrence, avec ses nouvelles valeurs
  // (comme Google Agenda).
  private async modifierSuivantes(a: Acteur, r: SerieLue, occ: Date, dto: ModifierRendezVousDto) {
    const debut = new Date(dto.debut);
    const fin = new Date(dto.fin);
    if (!(fin > debut)) throw new BadRequestException('La fin doit suivre le début.');
    const avantSet = new Set(r.invites.map((i) => i.utilisateurId));
    const apres = [...new Set(dto.inviteIds.filter((x) => x !== a.userId))];
    const ajoutes = apres.filter((x) => !avantSet.has(x));
    const gardes = apres.filter((x) => avantSet.has(x));
    const retires = [...avantSet].filter((x) => !apres.includes(x));
    if (ajoutes.length && !hasRight(a.permissions, ETAPE.agendaReunions, 'ecriture')) {
      throw new ForbiddenException('Inviter des collègues demande l’Écriture de « Réunions ».');
    }
    await this.verifierMembres(a, ajoutes);
    const ancienne = parseRRule(r.regle!);
    // Même règle qu'avant avec un nombre de fois : ce qu'il en reste.
    // Recalée sur le nouveau premier rendez-vous (déplacé d'un mardi à un
    // jeudi : « chaque jeudi »), comme Google Agenda.
    let nouvelle = regleValide(dto.regle === undefined ? r.regle : dto.regle, debut) ?? null;
    // Même règle (nombre de fois compris) : on reprend ce qu'il en reste. Un
    // nombre de fois changé ou retiré est pris tel quel.
    const memeRegle = nouvelle !== null && nouvelle === formatRRule(alignRecurrence(ancienne, debut.toISOString()));
    if (nouvelle && memeRegle && ancienne.count) {
      const dejaPassees = expandOccurrences(ancienne, r.debut.toISOString(), {
        from: r.debut.toISOString(),
        to: occ.toISOString(),
      }).length;
      nouvelle = formatRRule({ ...parseRRule(nouvelle), count: Math.max(1, ancienne.count - dejaPassees) });
    }
    const tronquee = regleTronquee(r.regle!, occ);
    // Les dates annulées à partir de là le restent dans la nouvelle série
    // (décalées comme elle) ; les réponses des invités gardés aussi, tant que
    // l'heure et la durée ne changent pas.
    // Par rang : la n-ième date à partir de là dans l'ancienne série devient
    // la n-ième de la nouvelle (le jour peut changer, la règle aussi).
    const annulees = r.exceptions.filter((e) => e.annulee && +e.occurrence >= +occ);
    let annuleesReportees: Date[] = [];
    if (nouvelle && annulees.length) {
      const loin = new Date(Date.UTC(9999, 0, 1)).toISOString();
      const anciennes = expandOccurrences(ancienne, r.debut.toISOString(), { from: occ.toISOString(), to: loin }, 2000);
      const rang = Math.max(...annulees.map((e) => anciennes.indexOf(e.occurrence.toISOString())));
      const nouvelles = expandOccurrences(
        parseRRule(nouvelle),
        debut.toISOString(),
        { from: debut.toISOString(), to: loin },
        rang + 1,
      );
      annuleesReportees = annulees
        .map((e) => nouvelles[anciennes.indexOf(e.occurrence.toISOString())])
        .filter((x): x is string => !!x)
        .map((x) => new Date(x));
    }
    const memesHeures =
      debut.toISOString().slice(11) === occ.toISOString().slice(11) && +fin - +debut === +r.fin - +r.debut;
    const reponses = new Map(r.invites.map((i) => [i.utilisateurId, i]));
    const creee = await this.prisma.$transaction(async (tx) => {
      const maj = await tx.rendezVous.updateMany({
        where: { id: r.id, annuleLe: null },
        data: {
          regle: tronquee,
          finSerie: finSerieAvecExceptions(
            r.debut,
            r.fin,
            tronquee,
            r.exceptions.filter((e) => +e.occurrence < +occ),
          ),
          sequence: { increment: 1 },
        },
      });
      if (!maj.count) throw new NotFoundException('Rendez-vous introuvable');
      await tx.exceptionRendezVous.deleteMany({ where: { rendezVousId: r.id, occurrence: { gte: occ } } });
      await tx.rappelOccurrence.deleteMany({ where: { rendezVousId: r.id, occurrence: { gte: occ } } });
      return tx.rendezVous.create({
        data: {
          societeId: a.societeId,
          titre: dto.titre.trim(),
          debut,
          fin,
          lieu: dto.lieu?.trim() || null,
          description: dto.description?.trim() || null,
          lienVisio: dto.lienVisio?.trim() || null,
          rappelMinutes: dto.rappelMinutes ?? null,
          ...avecFinSerie(debut, fin, nouvelle),
          organisateurId: a.userId,
          invites: {
            create: apres.map((utilisateurId) => ({
              utilisateurId,
              ...(memesHeures && {
                reponse: reponses.get(utilisateurId)?.reponse ?? null,
                reponduLe: reponses.get(utilisateurId)?.reponduLe ?? null,
              }),
            })),
          },
          ...(annuleesReportees.length && {
            exceptions: { create: annuleesReportees.map((occurrence) => ({ occurrence, annulee: true })) },
          }),
        },
      });
    });
    const aPartir = `à partir du ${quandRendezVous(debut)}`;
    await this.prevenir(a, 'rdv_modifie', `Réunion modifiée · ${creee.titre} · ${aPartir}`, gardes);
    await this.prevenir(a, 'rdv_invitation', `Réunion · ${creee.titre} · ${aPartir}`, ajoutes);
    await this.prevenir(a, 'rdv_annule', `Réunion annulée · ${r.titre} · ${aPartir}`, retires);
    // L'ancienne série, raccourcie, à ses invités ; la nouvelle aux siens.
    if (avantSet.size) await this.invitations.envoyer(r.id, 'REQUEST');
    if (apres.length) await this.invitations.envoyer(creee.id, 'REQUEST');
    return { ok: true, id: creee.id };
  }

  private async prevenir(
    a: Acteur,
    type: 'rdv_modifie' | 'rdv_invitation' | 'rdv_annule',
    titre: string,
    ids: string[],
  ) {
    if (ids.length) {
      await this.notifications.envoyer({ societeId: a.societeId, type, titre, destinataireIds: ids, parId: a.userId });
    }
  }

  // Annuler : l'organisateur seul (circuit), avec la Suppression de « Mon agenda » ;
  // jamais un entretien de recrutement (depuis sa candidature).
  // Sur une série (16/11/2026) : cette occurrence, ou celle-ci et les
  // suivantes (la série s'arrête la veille) ; sinon toute la série.
  async annuler(a: Acteur, id: string, portee?: Portee, occurrence?: string) {
    const r = await this.prisma.rendezVous.findFirst({
      where: { id, societeId: a.societeId, annuleLe: null },
      include: { invites: true, exceptions: true },
    });
    if (!r) throw new NotFoundException('Rendez-vous introuvable');
    if (r.organisateurId !== a.userId) throw new ForbiddenException('Seul l’organisateur annule ce rendez-vous.');
    if (await this.prisma.candidature.count({ where: { rendezVousId: id } })) {
      throw new ConflictException('Un entretien s’annule depuis le recrutement.');
    }
    if (r.regle && portee && portee !== 'toutes') {
      const occ = occurrenceValide(r, occurrence);
      if (portee === 'occurrence' || +occ !== +r.debut) {
        await this.prisma.$transaction(async (tx) => {
          const maj = await tx.rendezVous.updateMany({
            where: { id, annuleLe: null },
            data: {
              sequence: { increment: 1 },
              ...(portee === 'suivantes' && avecFinSerie(r.debut, r.fin, regleTronquee(r.regle!, occ))),
            },
          });
          if (!maj.count) throw new NotFoundException('Rendez-vous introuvable');
          if (portee === 'occurrence') {
            await tx.exceptionRendezVous.upsert({
              where: { rendezVousId_occurrence: { rendezVousId: id, occurrence: occ } },
              create: { rendezVousId: id, occurrence: occ, annulee: true },
              update: { annulee: true },
            });
          } else {
            await tx.exceptionRendezVous.deleteMany({ where: { rendezVousId: id, occurrence: { gte: occ } } });
            await tx.rappelOccurrence.deleteMany({ where: { rendezVousId: id, occurrence: { gte: occ } } });
          }
        });
        const invites = r.invites.map((i) => i.utilisateurId);
        const quand = portee === 'occurrence' ? quandRendezVous(occ) : `à partir du ${quandRendezVous(occ)}`;
        await this.prevenir(a, 'rdv_annule', `Réunion annulée · ${r.titre} · ${quand}`, invites);
        if (invites.length) await this.invitations.envoyer(id, 'REQUEST');
        return { ok: true };
      }
    }
    // Une série : sa prochaine date, pour le message.
    const aVenirAnnulee = r.regle ? prochaine(r) : null;
    await this.prisma.rendezVous.update({ where: { id }, data: { annuleLe: new Date(), sequence: { increment: 1 } } });
    if (r.invites.length) {
      await this.notifications.envoyer({
        societeId: a.societeId,
        type: 'rdv_annule',
        titre: `Réunion annulée · ${r.titre} · ${aVenirAnnulee ? `à partir du ${quandRendezVous(aVenirAnnulee)}` : quandRendezVous(r.debut)}`,
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
      include: { invites: { where: { utilisateurId: a.userId } }, exceptions: true },
    });
    const invite = r?.invites[0];
    if (!r || !invite) throw new NotFoundException('Invitation introuvable');
    // Une série : tant qu'il lui reste une occurrence à venir (la réponse vaut
    // pour toute la série).
    const aVenir = r.regle ? prochaine(r) : null;
    if (r.regle ? !aVenir : r.fin <= new Date()) throw new ConflictException('Cette réunion est passée.');
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
      titre: `${moi ? nomDe(moi) : 'Un invité'} · ${LIBELLES_REPONSE[reponse]} · ${r.titre} · ${aVenir ? `à partir du ${quandRendezVous(aVenir)}` : quandRendezVous(r.debut)}`,
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
          // Une série commencée avant : ses occurrences sont regardées plus bas.
          AND: [
            { OR: [{ finSerie: null }, { finSerie: { gt: debut } }] },
            { OR: [{ regle: { not: null } }, { fin: { gt: debut } }] },
          ],
          ...(exclure && { id: { not: exclure } }),
        },
        select: {
          organisateurId: true,
          titre: true,
          debut: true,
          fin: true,
          lieu: true,
          description: true,
          lienVisio: true,
          regle: true,
          exceptions: true,
          invites: { select: { utilisateurId: true, reponse: true } },
        },
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
      // Une série n'occupe le créneau que si l'une de ses occurrences le touche.
      if (r.regle && !occurrencesDans(r, debut, fin).length) continue;
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
