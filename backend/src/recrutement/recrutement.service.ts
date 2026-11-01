import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ETAPE, hasRight } from '@hub/domain';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DossiersPersonnelService } from '../rh/dossiers.service';
import { runAsSystem } from '../tenancy/tenant-context';
import type {
  DecisionEmbaucheDto,
  DecisionPosteDto,
  DemandePosteDto,
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
@Injectable()
export class RecrutementService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private dossiers: DossiersPersonnelService,
  ) {}

  async vue(a: Acteur) {
    const postes = await this.prisma.posteRecrutement.findMany({
      where: { societeId: a.societeId },
      include: { candidatures: { select: { etape: true } } },
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
        candidats: {
          candidature: p.candidatures.filter((c) => c.etape === 'candidature').length,
          entretien: p.candidatures.filter((c) => c.etape === 'entretien').length,
          embauche: p.candidatures.filter((c) => c.etape === 'embauche').length,
          refusee: p.candidatures.filter((c) => c.etape === 'refusee').length,
        },
      })),
      equipes,
      droits: {
        demanderPoste: hasRight(a.permissions, ETAPE.recrutementPostes, 'ecriture'),
        approuverPoste: hasRight(a.permissions, ETAPE.recrutementPostes, 'validation'),
        fermerPoste: hasRight(a.permissions, ETAPE.recrutementPostes, 'suppression'),
        voirCandidats: hasRight(a.permissions, ETAPE.recrutementCandidatures, 'lecture'),
        gererCandidats: hasRight(a.permissions, ETAPE.recrutementCandidatures, 'ecriture'),
        retirerCandidats: hasRight(a.permissions, ETAPE.recrutementCandidatures, 'suppression'),
        decider: hasRight(a.permissions, ETAPE.recrutementDecision, 'validation'),
      },
    };
  }

  async candidats(a: Acteur, posteId: string) {
    const poste = await this.poste(a, posteId);
    const c = await this.prisma.candidature.findMany({ where: { posteId: poste.id }, orderBy: { createdAt: 'asc' } });
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
    }));
  }

  async demanderPoste(a: Acteur, dto: DemandePosteDto) {
    if (dto.celluleId) {
      const cellule = await this.prisma.cellule.findFirst({ where: { id: dto.celluleId, societeId: a.societeId } });
      if (!cellule) throw new BadRequestException('Équipe introuvable dans la société.');
    }
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
    if (!direct) {
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
    return { ok: true };
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
    return { ok: true, dossierId: dossier.id };
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

  private async poste(a: Acteur, id: string) {
    const p = await this.prisma.posteRecrutement.findFirst({ where: { id, societeId: a.societeId } });
    if (!p) throw new NotFoundException('Poste introuvable');
    return p;
  }

  // La candidature d'un poste de la société (la candidature ne porte pas la société).
  private async candidature(a: Acteur, id: string) {
    const c = await this.prisma.candidature.findFirst({
      where: { id, poste: { societeId: a.societeId } },
      include: { poste: { select: { intitule: true } } },
    });
    if (!c) throw new NotFoundException('Candidature introuvable');
    return c;
  }

  // Titulaires actifs, dans la société, d'un rôle qui a ce droit sur l'étape.
  private async titulaires(societeId: string, etape: string, droit: 'validation' | 'ecriture' = 'validation') {
    const roles = await this.prisma.roleRight.findMany({
      where: { [droit]: true, etape: { cle: etape } },
      select: { roleId: true },
    });
    const l = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId, roleId: { in: roles.map((r) => r.roleId) }, utilisateur: { actif: true } },
      select: { utilisateurId: true },
    });
    return [...new Set(l.map((x) => x.utilisateurId))];
  }

  private async noms(ids: string[]) {
    const u = await this.prisma.utilisateur.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, prenom: true, nom: true },
    });
    return new Map(u.map((x) => [x.id, nomDe(x)]));
  }
}
