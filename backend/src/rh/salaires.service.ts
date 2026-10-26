import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActionPaie, MotifSalaire } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { LIBELLE_MOTIF_SALAIRE, refusProposition, salaireAu } from './regles-salaire';

const ROLE_CFO = 'CFO';
const ROLE_CEO = 'CEO (transverse)';

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : 'date inconnue');
const nomDe = (d: { prenom: string; nom: string }) => `${d.prenom} ${d.nom}`.trim();

const SELECT_CHANGEMENT = {
  id: true,
  montant: true,
  dateEffet: true,
  motif: true,
  statut: true,
  proposeParId: true,
  proposeLe: true,
  decideParId: true,
  decideLe: true,
  motifRefus: true,
} as const;

// Historique des salaires (revue RH validée 20/10/2026) : la RH propose un
// changement (montant, date d'effet, motif obligatoire), le CFO le valide —
// le CEO pour le salaire du CFO — et personne ne décide de son propre
// salaire ni de sa propre proposition. Chaque affichage d'un montant et
// chaque décision sont inscrits au journal de la paie (jamais le montant).
@Injectable()
export class SalairesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private tracer(dossierId: string, action: ActionPaie, parId: string) {
    return this.prisma.journalPaie.create({ data: { dossierId, action, parId } });
  }

  private async dossier(id: string) {
    const d = await this.prisma.dossierPersonnel.findUnique({
      where: { id },
      select: {
        id: true,
        societeId: true,
        prenom: true,
        nom: true,
        utilisateurId: true,
        collaborateur: { select: { utilisateurId: true } },
      },
    });
    if (!d) throw new NotFoundException('Dossier introuvable');
    return { ...d, compteId: d.utilisateurId ?? d.collaborateur?.utilisateurId ?? null };
  }

  // Qui peut décider d'un changement du salaire de ce dossier : les CFO de sa
  // société, ou les CEO si le salarié est lui-même CFO ; jamais l'intéressé.
  private async valideurs(d: { societeId: string; compteId: string | null }) {
    const cfo = await this.notifications.titulairesRole(d.societeId, ROLE_CFO);
    const ids =
      d.compteId && cfo.includes(d.compteId) ? await this.notifications.titulairesRole(d.societeId, ROLE_CEO) : cfo;
    return { ids: ids.filter((x) => x !== d.compteId), role: d.compteId && cfo.includes(d.compteId) ? 'CEO' : 'CFO' };
  }

  // Fiche RH : salaire en vigueur + historique (affichage tracé).
  async historique(dossierId: string, acteurId: string) {
    const d = await this.dossier(dossierId);
    const changements = await this.prisma.changementSalaire.findMany({
      where: { dossierId },
      select: SELECT_CHANGEMENT,
      orderBy: [{ proposeLe: 'desc' }],
    });
    await this.tracer(dossierId, 'salaire_consulte', acteurId);
    const noms = await this.noms(changements.flatMap((c) => [c.proposeParId, c.decideParId]));
    return {
      enVigueur: salaireAu(changements, aujourdhui()),
      valideur: (await this.valideurs(d)).role,
      changements: changements.map((c) => ({
        ...c,
        proposePar: c.proposeParId ? (noms.get(c.proposeParId) ?? null) : null,
        decidePar: c.decideParId ? (noms.get(c.decideParId) ?? null) : null,
      })),
    };
  }

  async proposer(dossierId: string, p: { montant: number; dateEffet: string; motif: MotifSalaire }, acteurId: string) {
    const d = await this.dossier(dossierId);
    const existants = await this.prisma.changementSalaire.findMany({ where: { dossierId }, select: { statut: true } });
    if (existants.some((c) => c.statut === 'a_valider')) {
      throw new ConflictException('Un changement attend déjà sa validation : retirez-le ou attendez la décision.');
    }
    const refus = refusProposition(
      p,
      existants.some((c) => c.statut === 'valide'),
      aujourdhui(),
    );
    if (refus) throw new BadRequestException(refus);
    const { ids, role } = await this.valideurs(d);
    if (!ids.filter((x) => x !== acteurId).length)
      throw new ConflictException(`Aucun ${role} pour valider ce salaire : attribuez d'abord le rôle.`);
    await this.prisma.changementSalaire.create({ data: { dossierId, ...p, proposeParId: acteurId } });
    await this.tracer(dossierId, 'salaire_propose', acteurId);
    await this.notifications.envoyer({
      societeId: d.societeId,
      type: 'salaire_a_valider',
      titre: `Salaire à valider · ${nomDe(d)} · ${LIBELLE_MOTIF_SALAIRE[p.motif]}, effet le ${dateFr(p.dateEffet)}`,
      destinataireIds: ids,
      parId: acteurId,
    });
    return this.historique(dossierId, acteurId);
  }

  // Retrait d'une proposition en attente (erreur de saisie) : sans trace de
  // montant, la proposition disparaît.
  async retirer(dossierId: string, changementId: string) {
    const c = await this.prisma.changementSalaire.findFirst({ where: { id: changementId, dossierId } });
    if (!c) throw new NotFoundException('Changement introuvable');
    if (c.statut !== 'a_valider') throw new ConflictException('Seul un changement en attente se retire.');
    await this.prisma.changementSalaire.delete({ where: { id: changementId } });
  }

  // Changements que l'acteur peut décider (liste sans montant).
  async aValider(acteurId: string) {
    const enAttente = await this.prisma.changementSalaire.findMany({
      where: { statut: 'a_valider' },
      select: { ...SELECT_CHANGEMENT, dossierId: true },
      orderBy: { proposeLe: 'asc' },
    });
    const lignes = [];
    for (const c of enAttente) {
      const d = await this.dossier(c.dossierId);
      if (c.proposeParId === acteurId || !(await this.valideurs(d)).ids.includes(acteurId)) continue;
      lignes.push({
        id: c.id,
        dossierId: d.id,
        salarie: nomDe(d),
        motif: c.motif,
        dateEffet: c.dateEffet,
        proposeParId: c.proposeParId,
        proposeLe: c.proposeLe,
      });
    }
    const noms = await this.noms(lignes.map((l) => l.proposeParId));
    return lignes.map(({ proposeParId, ...l }) => ({
      ...l,
      proposePar: proposeParId ? (noms.get(proposeParId) ?? null) : null,
    }));
  }

  // Montants (en vigueur → proposé) d'un changement à décider : affichage tracé.
  async detail(changementId: string, acteurId: string) {
    const { c, d } = await this.decidable(changementId, acteurId);
    const valides = await this.prisma.changementSalaire.findMany({
      where: { dossierId: d.id, statut: 'valide' },
      select: SELECT_CHANGEMENT,
    });
    await this.tracer(d.id, 'salaire_consulte', acteurId);
    return {
      id: c.id,
      salarie: nomDe(d),
      motif: c.motif,
      dateEffet: c.dateEffet,
      montant: c.montant,
      actuel: salaireAu(valides, c.dateEffet ?? aujourdhui()),
    };
  }

  async decider(changementId: string, acteurId: string, valide: boolean, motifRefus?: string) {
    const { c, d } = await this.decidable(changementId, acteurId);
    if (!valide && !motifRefus?.trim()) throw new BadRequestException('Le motif du refus est obligatoire.');
    const maj = await this.prisma.changementSalaire.updateMany({
      where: { id: c.id, statut: 'a_valider' },
      data: {
        statut: valide ? 'valide' : 'refuse',
        decideParId: acteurId,
        decideLe: new Date(),
        motifRefus: valide ? '' : motifRefus!.trim(),
      },
    });
    if (!maj.count) throw new ConflictException('Ce changement a déjà été décidé.');
    await this.tracer(d.id, valide ? 'salaire_modifie' : 'salaire_refuse', acteurId);
    await this.notifications.envoyer({
      societeId: d.societeId,
      type: 'salaire_decide',
      titre: valide
        ? `Salaire validé · ${nomDe(d)} · ${LIBELLE_MOTIF_SALAIRE[c.motif]}, effet le ${dateFr(c.dateEffet)}`
        : `Salaire refusé · ${nomDe(d)} · ${motifRefus!.trim()}`,
      destinataireIds: [c.proposeParId],
      parId: acteurId,
    });
    return this.aValider(acteurId);
  }

  private async decidable(changementId: string, acteurId: string) {
    const c = await this.prisma.changementSalaire.findUnique({
      where: { id: changementId },
      select: { ...SELECT_CHANGEMENT, dossierId: true },
    });
    if (!c) throw new NotFoundException('Changement introuvable');
    if (c.statut !== 'a_valider') throw new ConflictException('Ce changement a déjà été décidé.');
    const d = await this.dossier(c.dossierId);
    if (d.compteId === acteurId) throw new ForbiddenException('Vous ne pouvez pas décider de votre propre salaire.');
    if (c.proposeParId === acteurId)
      throw new ForbiddenException('Vous ne pouvez pas valider votre propre proposition.');
    const { ids, role } = await this.valideurs(d);
    if (!ids.includes(acteurId)) throw new ForbiddenException(`Ce salaire est validé par le ${role}.`);
    return { c, d };
  }

  private async noms(ids: (string | null)[]) {
    const uniques = [...new Set(ids.filter((x): x is string => !!x))];
    const u = uniques.length
      ? await this.prisma.utilisateur.findMany({
          where: { id: { in: uniques } },
          select: { id: true, prenom: true, nom: true },
        })
      : [];
    return new Map(u.map((x) => [x.id, nomDe(x)]));
  }
}
