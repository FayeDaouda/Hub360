import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ETAPE, formatTime, formatWeekdayDayMonth, hasRight } from '@hub/domain';
import { InvitationsAgendaService } from '../agenda/invitations.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DossiersPersonnelService } from '../rh/dossiers.service';
import { appelOuvert, type PieceDemandee, type QuestionAppel } from './appels.service';
import { referenceCandidature, titulaires } from './titulaires';
import { runAsSystem, runInCompany } from '../tenancy/tenant-context';
import type {
  DecisionEmbaucheDto,
  DecisionPosteDto,
  DemandePosteDto,
  EmbaucheDirecteDto,
  EntretienDto,
  NoteCandidatDto,
  NouveauCandidatDto,
} from './recrutement.dto';

type Acteur = { userId: string; societeId: string; role: string; permissions?: Record<string, string> };

const nomDe = (u: { prenom: string; nom: string }) => `${u.prenom} ${u.nom}`.trim();
const MOIS_CONSERVATION = 12;

// Recrutement (lot 13, décision du 01/11/2026) : Poste ouvert → Candidatures →
// Entretiens → Décision → Intégration RH. Ouvrir un poste : Écriture de
// « Postes », approuvé par sa Validation (le CEO au départ ; qui a la
// Validation ouvre directement). Candidats saisis à la main. Décider
// l'embauche : « Décision d'embauche » (la RH et le N+1, le Dir. GC, au
// départ) — le dossier du personnel s'ouvre, l'intégration suit. Une
// candidature refusée est effacée 12 mois après le refus.
//
// Côté RH (01/11/2026) : deux chemins — l'embauche directe (dossier ouvert
// tout de suite, tracée comme un poste pourvu) ou le circuit ; l'entretien
// est un rendez-vous de l'Agenda ; chaque étape prévient qui suit (demandeur
// du poste, RH) ; la RH voit les recrutements de toutes les sociétés.
@Injectable()
export class RecrutementService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private dossiers: DossiersPersonnelService,
    private email: EmailService,
    private invitations: InvitationsAgendaService,
  ) {}

  async vue(a: Acteur) {
    const postes = await this.prisma.posteRecrutement.findMany({
      where: { societeId: a.societeId },
      include: { candidatures: { select: { etape: true, source: true } }, appel: true },
      orderBy: [{ createdAt: 'desc' }],
    });
    const equipes = await this.prisma.cellule.findMany({
      where: { societeId: a.societeId },
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' },
    });
    const noms = await this.noms(postes.map((p) => p.demandeParId));
    const equipesNoms = new Map(equipes.map((e) => [e.id, e.nom]));
    return {
      postes: postes.map((p) => ({
        id: p.id,
        intitule: p.intitule,
        description: p.description,
        equipe: p.celluleId ? (equipesNoms.get(p.celluleId) ?? null) : null,
        statut: p.statut,
        demandePar: noms.get(p.demandeParId) ?? '—',
        motifRefus: p.motifRefus,
        direct: p.direct,
        // Appel à candidatures (lien externe) : réglages, état, candidatures reçues.
        appel: p.appel && {
          slug: p.appel.slug,
          presentation: p.appel.presentation,
          lieu: p.appel.lieu,
          typeContrat: p.appel.typeContrat,
          dateLimite: p.appel.dateLimite,
          pieces: p.appel.pieces as unknown as PieceDemandee[],
          questions: p.appel.questions as unknown as QuestionAppel[],
          ouvert: p.appel.ouvert,
          enLigne: appelOuvert(p.appel, p.statut),
          recues: p.candidatures.filter((c) => c.source === 'lien').length,
        },
        candidats: {
          candidature: p.candidatures.filter((c) => c.etape === 'candidature').length,
          entretien: p.candidatures.filter((c) => c.etape === 'entretien').length,
          embauche: p.candidatures.filter((c) => c.etape === 'embauche').length,
          refusee: p.candidatures.filter((c) => c.etape === 'refusee').length,
        },
      })),
      equipes,
      // Personnes à inviter à un entretien (Agenda).
      personnes: hasRight(a.permissions, ETAPE.recrutementCandidatures, 'ecriture') ? await this.personnes(a) : [],
      droits: {
        demanderPoste: hasRight(a.permissions, ETAPE.recrutementPostes, 'ecriture'),
        approuverPoste: hasRight(a.permissions, ETAPE.recrutementPostes, 'validation'),
        fermerPoste: hasRight(a.permissions, ETAPE.recrutementPostes, 'suppression'),
        voirCandidats: hasRight(a.permissions, ETAPE.recrutementCandidatures, 'lecture'),
        gererCandidats: hasRight(a.permissions, ETAPE.recrutementCandidatures, 'ecriture'),
        retirerCandidats: hasRight(a.permissions, ETAPE.recrutementCandidatures, 'suppression'),
        decider: hasRight(a.permissions, ETAPE.recrutementDecision, 'validation'),
        embaucheDirecte: hasRight(a.permissions, ETAPE.recrutementDirect, 'ecriture'),
        voirGroupe: hasRight(a.permissions, ETAPE.recrutementGroupe, 'lecture'),
        gererAppels: hasRight(a.permissions, ETAPE.recrutementAppels, 'ecriture'),
      },
    };
  }

  async candidats(a: Acteur, posteId: string) {
    const poste = await this.poste(a, posteId);
    const c = await this.prisma.candidature.findMany({
      where: { posteId: poste.id },
      include: { _count: { select: { pieces: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const rdvIds = c.map((x) => x.rendezVousId).filter((x): x is string => !!x);
    const rdv = new Map(
      (
        await this.prisma.rendezVous.findMany({
          where: { id: { in: rdvIds }, annuleLe: null },
          select: { id: true, debut: true, fin: true, lieu: true },
        })
      ).map((r) => [r.id, { debut: r.debut.toISOString(), fin: r.fin.toISOString(), lieu: r.lieu }]),
    );
    return c.map((x) => ({
      id: x.id,
      prenom: x.prenom,
      nom: x.nom,
      email: x.email,
      telephone: x.telephone,
      notes: x.notes,
      etape: x.etape,
      motif: x.motif,
      decideLe: x.decideLe?.toISOString() ?? null,
      dossierId: x.dossierId,
      entretien: (x.rendezVousId && rdv.get(x.rendezVousId)) || null,
      source: x.source,
      pieces: x._count.pieces,
      creeLe: x.createdAt.toISOString(),
    }));
  }

  // Fiche d'un candidat : tout ce qu'il a déposé (réponses, pièces) pour
  // ceux qui décident. Les pièces se téléchargent une à une.
  async fiche(a: Acteur, id: string) {
    const c = await this.candidature(a, id);
    const [pieces, appel] = await Promise.all([
      this.prisma.pieceCandidature.findMany({
        where: { candidatureId: id },
        select: { id: true, cle: true, libelle: true, nom: true, taille: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.appelCandidature.findUnique({ where: { posteId: c.posteId }, select: { questions: true } }),
    ]);
    const questions = (appel?.questions as unknown as QuestionAppel[] | undefined) ?? [];
    const reponses = (c.reponses as Record<string, string> | null) ?? {};
    return {
      id: c.id,
      reference: referenceCandidature(c.id),
      prenom: c.prenom,
      nom: c.nom,
      email: c.email,
      telephone: c.telephone,
      poste: c.poste.intitule,
      source: c.source,
      etape: c.etape,
      creeLe: c.createdAt.toISOString(),
      consentementLe: c.consentementLe?.toISOString() ?? null,
      notes: c.notes,
      motif: c.motif,
      // Réponses dans l'ordre des questions ; une question retirée depuis garde sa réponse.
      reponses: [
        ...questions.filter((q) => reponses[q.id]).map((q) => ({ question: q.libelle, reponse: reponses[q.id] })),
        ...Object.entries(reponses)
          .filter(([qid]) => !questions.some((q) => q.id === qid))
          .map(([, reponse]) => ({ question: 'Question retirée de l’appel', reponse })),
      ],
      pieces,
    };
  }

  async piece(a: Acteur, id: string, pieceId: string) {
    await this.candidature(a, id);
    const p = await this.prisma.pieceCandidature.findFirst({
      where: { id: pieceId, candidatureId: id },
      select: { nom: true, url: true },
    });
    if (!p) throw new NotFoundException('Pièce introuvable');
    return p;
  }

  async demanderPoste(a: Acteur, dto: DemandePosteDto) {
    if (dto.celluleId) await this.equipe(a, dto.celluleId);
    const direct = hasRight(a.permissions, ETAPE.recrutementPostes, 'validation');
    const p = await this.prisma.posteRecrutement.create({
      data: {
        societeId: a.societeId,
        intitule: dto.intitule.trim(),
        description: dto.description?.trim() || null,
        celluleId: dto.celluleId ?? null,
        statut: direct ? 'ouvert' : 'a_approuver',
        demandeParId: a.userId,
        approuveParId: direct ? a.userId : null,
        approuveLe: direct ? new Date() : null,
      },
    });
    if (direct) await this.posteOuvert(a, p.intitule);
    else {
      await this.notifications.envoyer({
        societeId: a.societeId,
        type: 'poste_a_approuver',
        titre: `Poste à approuver · ${p.intitule}`,
        destinataireIds: await this.titulaires(a.societeId, ETAPE.recrutementPostes),
        parId: a.userId,
      });
    }
    return { id: p.id, statut: p.statut };
  }

  async deciderPoste(a: Acteur, id: string, dto: DecisionPosteDto) {
    const p = await this.poste(a, id);
    if (p.statut !== 'a_approuver') throw new ConflictException('Ce poste n’attend pas d’approbation.');
    await this.prisma.posteRecrutement.update({
      where: { id },
      data: dto.accepter
        ? { statut: 'ouvert', approuveParId: a.userId, approuveLe: new Date() }
        : { statut: 'ferme', motifRefus: dto.motif!.trim() },
    });
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'poste_decide',
      titre: `Poste ${p.intitule} : ${dto.accepter ? 'ouverture approuvée' : `refusé · « ${dto.motif!.trim()} »`}`,
      destinataireIds: [p.demandeParId],
      parId: a.userId,
    });
    if (dto.accepter) await this.posteOuvert(a, p.intitule);
    return { ok: true };
  }

  // Un poste ouvert : la RH (qui ajoute les candidats) est prévenue.
  private async posteOuvert(a: Acteur, intitule: string) {
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'poste_ouvert',
      titre: `Poste ouvert · ${intitule} : candidats à trouver`,
      destinataireIds: await this.titulaires(a.societeId, ETAPE.recrutementCandidatures, 'ecriture'),
      parId: a.userId,
    });
  }

  async fermerPoste(a: Acteur, id: string) {
    const p = await this.poste(a, id);
    if (p.statut === 'ferme') throw new ConflictException('Poste déjà fermé.');
    await this.prisma.posteRecrutement.update({ where: { id }, data: { statut: 'ferme' } });
    return { ok: true };
  }

  async ajouterCandidat(a: Acteur, posteId: string, dto: NouveauCandidatDto) {
    const p = await this.poste(a, posteId);
    if (p.statut !== 'ouvert') throw new ConflictException('On n’ajoute un candidat qu’à un poste ouvert.');
    const c = await this.prisma.candidature.create({
      data: {
        posteId: p.id,
        prenom: dto.prenom.trim(),
        nom: dto.nom.trim(),
        email: dto.email?.trim() || null,
        telephone: dto.telephone?.trim() || null,
        notes: dto.notes?.trim() ?? '',
        creeParId: a.userId,
      },
    });
    return { id: c.id };
  }

  // Note d'entretien ; avec `entretien`, le candidat passe en entretien.
  async noter(a: Acteur, id: string, dto: NoteCandidatDto) {
    const c = await this.candidature(a, id);
    if (c.etape === 'embauche' || c.etape === 'refusee') throw new ConflictException('Candidature déjà décidée.');
    const auteur = (await this.noms([a.userId])).get(a.userId) ?? '';
    const ligne = `${new Date().toISOString().slice(0, 10)} · ${auteur} : ${dto.note.trim()}`;
    await this.prisma.candidature.update({
      where: { id },
      data: {
        notes: c.notes ? `${c.notes}\n${ligne}` : ligne,
        ...(dto.entretien && c.etape === 'candidature' && { etape: 'entretien' }),
      },
    });
    return { ok: true };
  }

  // Embaucher : le dossier du personnel s'ouvre (la RH le complète), le poste
  // est pourvu, la RH est prévenue. Refuser : motif, effacement à 12 mois.
  async decider(a: Acteur, id: string, dto: DecisionEmbaucheDto) {
    const c = await this.candidature(a, id);
    if (c.etape === 'embauche' || c.etape === 'refusee') throw new ConflictException('Candidature déjà décidée.');
    if (!dto.embaucher) {
      await this.prisma.candidature.update({
        where: { id },
        data: { etape: 'refusee', decideParId: a.userId, decideLe: new Date(), motif: dto.motif!.trim() },
      });
      await this.notifications.envoyer({
        societeId: a.societeId,
        type: 'candidat_decide',
        titre: `Candidat non retenu · ${c.prenom} ${c.nom} · ${c.poste.intitule}`,
        destinataireIds: [c.poste.demandeParId],
        parId: a.userId,
      });
      if (dto.prevenirCandidat) await this.ecrireAuCandidat(a, c, { type: 'reponse', retenu: false });
      return { ok: true };
    }
    const dossier = await this.dossiers.creer(
      {
        societeId: a.societeId,
        prenom: c.prenom,
        nom: c.nom,
        poste: c.poste.intitule,
        dateEntree: dto.dateEntree,
        telephone: c.telephone ?? undefined,
        emailPerso: c.email ?? undefined,
      } as never,
      a.userId,
    );
    await this.prisma.$transaction([
      this.prisma.candidature.update({
        where: { id },
        data: { etape: 'embauche', decideParId: a.userId, decideLe: new Date(), dossierId: dossier.id },
      }),
      this.prisma.posteRecrutement.update({ where: { id: c.posteId }, data: { statut: 'pourvu' } }),
    ]);
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'embauche_decidee',
      titre: `Embauche · ${c.prenom} ${c.nom} · ${c.poste.intitule} · entrée le ${dto.dateEntree} : dossier du personnel ouvert`,
      destinataireIds: await this.titulaires(a.societeId, ETAPE.rh, 'ecriture'),
      parId: a.userId,
    });
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'candidat_decide',
      titre: `Embauche · ${c.prenom} ${c.nom} · ${c.poste.intitule} · entrée le ${dto.dateEntree}`,
      destinataireIds: [c.poste.demandeParId],
      parId: a.userId,
    });
    if (dto.prevenirCandidat) await this.ecrireAuCandidat(a, c, { type: 'reponse', retenu: true });
    return { ok: true, dossierId: dossier.id };
  }

  // Embauche directe : le dossier du personnel s'ouvre tout de suite ; un
  // poste pourvu (« direct ») et une candidature embauchée la gardent tracée.
  async embaucheDirecte(a: Acteur, dto: EmbaucheDirecteDto) {
    if (dto.celluleId) await this.equipe(a, dto.celluleId);
    const dossier = await this.dossiers.creer(
      {
        societeId: a.societeId,
        prenom: dto.prenom.trim(),
        nom: dto.nom.trim(),
        poste: dto.intitule.trim(),
        dateEntree: dto.dateEntree,
        telephone: dto.telephone?.trim() || undefined,
        emailPerso: dto.email?.trim() || undefined,
      } as never,
      a.userId,
    );
    const maintenant = new Date();
    await this.prisma.posteRecrutement.create({
      data: {
        societeId: a.societeId,
        intitule: dto.intitule.trim(),
        celluleId: dto.celluleId ?? null,
        statut: 'pourvu',
        direct: true,
        demandeParId: a.userId,
        approuveParId: a.userId,
        approuveLe: maintenant,
        candidatures: {
          create: {
            prenom: dto.prenom.trim(),
            nom: dto.nom.trim(),
            email: dto.email?.trim() || null,
            telephone: dto.telephone?.trim() || null,
            etape: 'embauche',
            decideParId: a.userId,
            decideLe: maintenant,
            dossierId: dossier.id,
            creeParId: a.userId,
          },
        },
      },
    });
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'embauche_decidee',
      titre: `Embauche directe · ${dto.prenom.trim()} ${dto.nom.trim()} · ${dto.intitule.trim()} · entrée le ${dto.dateEntree} : dossier du personnel ouvert`,
      destinataireIds: await this.titulaires(a.societeId, ETAPE.rh, 'ecriture'),
      parId: a.userId,
    });
    return { ok: true, dossierId: dossier.id };
  }

  // Entretien : un rendez-vous de l'Agenda, le demandeur du poste invité
  // d'office ; le candidat passe en entretien. Replanifier annule l'ancien.
  async planifierEntretien(a: Acteur, id: string, dto: EntretienDto) {
    const c = await this.candidature(a, id);
    if (c.etape === 'embauche' || c.etape === 'refusee') throw new ConflictException('Candidature déjà décidée.');
    if (new Date(dto.fin) <= new Date(dto.debut)) throw new BadRequestException('La fin doit suivre le début.');
    const demandes = [...new Set([c.poste.demandeParId, ...(dto.inviteIds ?? [])])].filter((x) => x !== a.userId);
    const membres = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId: a.societeId, utilisateurId: { in: demandes }, utilisateur: { actif: true } },
      select: { utilisateurId: true },
    });
    const invites = [...new Set(membres.map((m) => m.utilisateurId))];
    // L'ancien entretien n'est annulé (et ses invités prévenus) que s'il était
    // encore prévu et à venir : ni un entretien passé, ni un déjà annulé.
    const maintenant = new Date();
    const { rdv, ancienAnnule } = await this.prisma.$transaction(async (tx) => {
      const ancien = c.rendezVousId
        ? await tx.rendezVous.updateMany({
            where: { id: c.rendezVousId, annuleLe: null, debut: { gt: maintenant } },
            data: { annuleLe: maintenant },
          })
        : { count: 0 };
      const r = await tx.rendezVous.create({
        data: {
          societeId: a.societeId,
          titre: `Entretien · ${c.prenom} ${c.nom} · ${c.poste.intitule}`,
          debut: new Date(dto.debut),
          fin: new Date(dto.fin),
          lieu: dto.lieu?.trim() || null,
          description: 'Recrutement',
          organisateurId: a.userId,
          invites: { create: invites.map((utilisateurId) => ({ utilisateurId })) },
        },
      });
      await tx.candidature.update({
        where: { id },
        data: { rendezVousId: r.id, ...(c.etape === 'candidature' && { etape: 'entretien' }) },
      });
      return { rdv: r, ancienAnnule: ancien.count > 0 };
    });
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'entretien_planifie',
      titre: `Entretien · ${c.prenom} ${c.nom} · ${c.poste.intitule} · ${formatWeekdayDayMonth(dto.debut)}, ${formatTime(dto.debut)}${rdv.lieu ? ` · ${rdv.lieu}` : ''}`,
      destinataireIds: invites,
      parId: a.userId,
    });
    // Dans l'agenda personnel des invités : l'ancien créneau retiré, le
    // nouveau proposé.
    if (c.rendezVousId && ancienAnnule) await this.invitations.envoyer(c.rendezVousId, 'CANCEL');
    await this.invitations.envoyer(rdv.id, 'REQUEST');
    if (dto.prevenirCandidat) {
      await this.ecrireAuCandidat(a, c, { type: 'convocation', debut: dto.debut, fin: dto.fin, lieu: rdv.lieu });
    }
    return { ok: true, rendezVousId: rdv.id };
  }

  // E-mail au candidat, au nom de la société (sans adresse, rien à envoyer) ;
  // un échec d'envoi n'annule pas l'action.
  private async ecrireAuCandidat(
    a: Acteur,
    c: { id: string; prenom: string; email: string | null; poste: { intitule: string } },
    message:
      { type: 'reponse'; retenu: boolean } | { type: 'convocation'; debut: string; fin: string; lieu: string | null },
  ) {
    if (!c.email) return;
    const societe = await this.prisma.societe.findUnique({ where: { id: a.societeId }, select: { nom: true } });
    await this.email.envoyerCandidat({
      ...message,
      email: c.email,
      prenom: c.prenom,
      societeNom: societe?.nom ?? '',
      poste: c.poste.intitule,
      reference: referenceCandidature(c.id),
    });
  }

  // « À votre attention » (Pilotage) : ce qui attend l'acteur — postes à
  // approuver, candidats en entretien à décider.
  async aTraiter(a: Acteur) {
    const approuve = hasRight(a.permissions, ETAPE.recrutementPostes, 'validation');
    const decide = hasRight(a.permissions, ETAPE.recrutementDecision, 'validation');
    const [postes, candidats] = await Promise.all([
      approuve
        ? this.prisma.posteRecrutement.findMany({
            where: { societeId: a.societeId, statut: 'a_approuver' },
            select: { id: true, intitule: true, demandeParId: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          })
        : [],
      decide
        ? this.prisma.candidature.findMany({
            where: { etape: 'entretien', poste: { societeId: a.societeId, statut: 'ouvert' } },
            select: { id: true, prenom: true, nom: true, poste: { select: { intitule: true } } },
            orderBy: { createdAt: 'asc' },
          })
        : [],
    ]);
    const noms = await this.noms(postes.map((p) => p.demandeParId));
    return {
      postes: postes.map((p) => ({ id: p.id, intitule: p.intitule, demandePar: noms.get(p.demandeParId) ?? '—' })),
      candidats: candidats.map((c) => ({ id: c.id, nom: `${c.prenom} ${c.nom}`, poste: c.poste.intitule })),
    };
  }

  // Recrutements du groupe : chaque société lue dans son propre périmètre
  // (ADR 0001). Lecture seule : on agit dans l'espace de la société.
  async groupe() {
    const societes = await runAsSystem('recrutement du groupe : sociétés ouvertes', () =>
      this.prisma.societe.findMany({
        where: { actif: true, accesOuvert: true },
        select: { id: true, nom: true, slug: true },
        orderBy: { nom: 'asc' },
      }),
    );
    return Promise.all(
      societes.map((s) =>
        runInCompany(s.id, async () => {
          const postes = await this.prisma.posteRecrutement.findMany({
            where: { societeId: s.id, statut: { in: ['a_approuver', 'ouvert'] } },
            include: { candidatures: { select: { etape: true } } },
            orderBy: { createdAt: 'desc' },
          });
          const depuis = new Date();
          depuis.setMonth(depuis.getMonth() - 12);
          const embauches = await this.prisma.candidature.count({
            where: { etape: 'embauche', decideLe: { gte: depuis }, poste: { societeId: s.id } },
          });
          return {
            societe: s,
            embauches12Mois: embauches,
            postes: postes.map((p) => ({
              id: p.id,
              intitule: p.intitule,
              statut: p.statut,
              candidature: p.candidatures.filter((c) => c.etape === 'candidature').length,
              entretien: p.candidatures.filter((c) => c.etape === 'entretien').length,
            })),
          };
        }),
      ),
    );
  }

  async retirerCandidat(a: Acteur, id: string) {
    await this.candidature(a, id);
    await this.prisma.candidature.delete({ where: { id } });
    return { ok: true };
  }

  // Données personnelles : une candidature refusée s'efface 12 mois après le refus.
  @Cron('30 3 * * *', { timeZone: 'Africa/Dakar' })
  async purger(maintenant = new Date()) {
    const limite = new Date(maintenant);
    limite.setMonth(limite.getMonth() - MOIS_CONSERVATION);
    return runAsSystem('recrutement : effacement des candidatures refusées depuis 12 mois', () =>
      this.prisma.candidature.deleteMany({ where: { etape: 'refusee', decideLe: { lt: limite } } }),
    );
  }

  private async equipe(a: Acteur, celluleId: string) {
    const cellule = await this.prisma.cellule.findFirst({ where: { id: celluleId, societeId: a.societeId } });
    if (!cellule) throw new BadRequestException('Équipe introuvable dans la société.');
  }

  private async personnes(a: Acteur) {
    const lignes = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId: a.societeId, utilisateur: { actif: true } },
      select: { utilisateur: { select: { id: true, prenom: true, nom: true } } },
    });
    const vus = new Map(lignes.map((l) => [l.utilisateur.id, nomDe(l.utilisateur)]));
    return [...vus].map(([id, nom]) => ({ id, nom })).sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
  }

  private async poste(a: Acteur, id: string) {
    const p = await this.prisma.posteRecrutement.findFirst({ where: { id, societeId: a.societeId } });
    if (!p) throw new NotFoundException('Poste introuvable');
    return p;
  }

  // La candidature d'un poste de la société (la candidature ne porte pas la société).
  private async candidature(a: Acteur, id: string) {
    const c = await this.prisma.candidature.findFirst({
      where: { id, poste: { societeId: a.societeId } },
      include: { poste: { select: { intitule: true, demandeParId: true } } },
    });
    if (!c) throw new NotFoundException('Candidature introuvable');
    return c;
  }

  private titulaires(societeId: string, etape: string, droit: 'validation' | 'ecriture' = 'validation') {
    return titulaires(this.prisma, societeId, etape, droit);
  }

  private async noms(ids: string[]) {
    const u = await this.prisma.utilisateur.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, prenom: true, nom: true },
    });
    return new Map(u.map((x) => [x.id, nomDe(x)]));
  }
}
