import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DemandeAbsence, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { ouDossierDuCompte } from './mon-compte';
import {
  DecisionN1Dto,
  DeposerAbsenceDto,
  DeposerRemboursementDto,
} from './demandes.dto';
import {
  chevauche,
  joursOuvrables,
  PART_CELLULE_ABSENTE_ALERTE,
  soldeConges,
  veille,
} from './regles-conges';

// RH · Demandes (lot 2) — absences (N+1 puis RH) et remboursements santé
// (soumise → transmise → remboursée/rejetée). Hypothèses de travail : cf.
// regles-conges.ts et le schéma Prisma.

// Chaîne du N+1 (conception d'origine, confirmée par le boss) :
//  collaborateur → chef de cellule (= dispatcher de sa cellule) ;
//  chef de cellule, ou sans cellule → Dir. GC ; Dir. GC → CTO.
// Les autres rôles de direction n'ont pas encore de N+1 défini : leur
// demande est refusée avec un message clair plutôt que routée au hasard.
export const ROLE_N1_DIRECTION = 'Dir. GC';
export const N1_DES_ROLES: Readonly<Record<string, string>> = { [ROLE_N1_DIRECTION]: 'CTO (transverse)' };
// Rôles « salariés » : sans cellule (ou chef de leur cellule) → Dir. GC.
const ROLES_SALARIES = ['collaborateur', 'Salarié'];
const ROLES_N1 = [ROLE_N1_DIRECTION, ...Object.values(N1_DES_ROLES)];

type Acteur = { userId: string; societeId: string; role: string };

const aujourdhui = () => new Date().toISOString().slice(0, 10);

type Livrable = { cle: string; source: 'avant-projet' | 'permis' | 'execution'; projetId: string; projet: string; groupe: string; echeance: string };

@Injectable()
export class DemandesService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
  ) {}

  // Jours fériés de la société du salarié (Réglages) : non décomptés.
  private async feries(societeId: string) {
    return (await this.reglages.joursFeries([societeId])).get(societeId)!;
  }

  // --- Salarié (Mon espace) ------------------------------------------------------
  private async moi(a: Acteur) {
    const dossier = await this.prisma.dossierPersonnel.findFirst({
      where: ouDossierDuCompte(a.userId),
      include: { collaborateur: { select: { id: true, cellule: { select: { id: true, dispatcherId: true } } } } },
    });
    if (!dossier) throw new NotFoundException('Aucun dossier du personnel pour ce compte — voir avec la RH.');
    const { collaborateur: collab, ...reste } = dossier;
    return { collab, dossier: reste };
  }

  private n1Pour(role: string, collab: { id: string; cellule: { dispatcherId: string | null } | null } | null) {
    const chef = collab?.cellule?.dispatcherId;
    if (collab && chef && chef !== collab.id) return { n1CollaborateurId: chef };
    if (N1_DES_ROLES[role]) return { n1Role: N1_DES_ROLES[role] };
    if (ROLES_SALARIES.includes(role)) return { n1Role: ROLE_N1_DIRECTION };
    throw new ConflictException(
      'Le circuit de validation (N+1) de ton rôle n’est pas encore défini par la direction : vois avec la RH.',
    );
  }

  async mesDemandes(a: Acteur) {
    const { dossier } = await this.moi(a);
    const [absences, remboursements] = await Promise.all([
      this.prisma.demandeAbsence.findMany({ where: { dossierId: dossier.id }, orderBy: { dateDebut: 'desc' } }),
      this.prisma.demandeRemboursement.findMany({
        where: { dossierId: dossier.id },
        orderBy: { createdAt: 'desc' },
        include: { justificatifs: { select: { id: true, nom: true } } },
      }),
    ]);
    return {
      solde: soldeConges(dossier.dateEntree, absences, aujourdhui()),
      absences: absences.map(versAbsence),
      remboursements,
    };
  }

  async deposerAbsence(a: Acteur, dto: DeposerAbsenceDto) {
    const { collab, dossier } = await this.moi(a);
    if (dto.dateFin < dto.dateDebut) throw new BadRequestException('La date de fin précède la date de début.');
    // Maquette : motif « facultatif pour un congé payé », donc requis sinon.
    if (dto.type !== 'conge_paye' && !dto.commentaire?.trim()) {
      throw new BadRequestException('Le motif est requis pour une absence autre qu’un congé payé.');
    }
    const jours = joursOuvrables(dto.dateDebut, dto.dateFin, await this.feries(dossier.societeId));
    if (jours === 0) throw new BadRequestException('Aucun jour ouvrable sur cette période.');
    const n1 = this.n1Pour(a.role, collab);
    const d = await this.prisma.demandeAbsence.create({
      data: {
        dossierId: dossier.id,
        type: dto.type,
        dateDebut: dto.dateDebut,
        dateFin: dto.dateFin,
        jours,
        commentaire: dto.commentaire ?? '',
        justificatifNom: dto.justificatif?.nom ?? null,
        justificatifCle: dto.justificatif?.url ?? null,
        ...n1,
      },
    });
    return versAbsence(d);
  }

  async repondreAutresDates(a: Acteur, id: string, accepte: boolean) {
    const { dossier } = await this.moi(a);
    const d = await this.absence(id);
    if (d.dossierId !== dossier.id) throw new ForbiddenException();
    if (d.statut !== 'autres_dates') throw new ConflictException('Aucune proposition de dates en attente.');
    if (!accepte) {
      return versAbsence(await this.prisma.demandeAbsence.update({ where: { id }, data: { statut: 'retiree' } }));
    }
    // Nouvelles dates acceptées : retour au N+1, qui confie les livrables de
    // CETTE période (règle : chaque livrable dû pendant l'absence est traité).
    const debut = d.datesProposeesDebut!;
    const fin = d.datesProposeesFin!;
    return versAbsence(
      await this.prisma.demandeAbsence.update({
        where: { id },
        data: { dateDebut: debut, dateFin: fin, jours: joursOuvrables(debut, fin, await this.feries(dossier.societeId)), statut: 'attente_n1', decisionN1: null },
      }),
    );
  }

  async retirer(a: Acteur, id: string) {
    const { dossier } = await this.moi(a);
    const d = await this.absence(id);
    if (d.dossierId !== dossier.id) throw new ForbiddenException();
    if (!['attente_n1', 'autres_dates'].includes(d.statut)) {
      throw new ConflictException('Demande déjà tranchée : voir avec la RH.');
    }
    return versAbsence(await this.prisma.demandeAbsence.update({ where: { id }, data: { statut: 'retiree' } }));
  }

  async deposerRemboursement(a: Acteur, dto: DeposerRemboursementDto) {
    // Maquette : « Facture et ordonnance jointes (obligatoire) ».
    if (!dto.justificatifs?.length) {
      throw new BadRequestException('Joignez la facture et l’ordonnance.');
    }
    const { dossier } = await this.moi(a);
    return this.prisma.demandeRemboursement.create({
      data: {
        dossierId: dossier.id,
        categorie: dto.categorie,
        beneficiaire: dto.beneficiaire,
        dateSoins: dto.dateSoins,
        montant: dto.montant,
        justificatifs: { create: (dto.justificatifs ?? []).map((f) => ({ nom: f.nom, cle: f.url })) },
      },
      include: { justificatifs: { select: { id: true, nom: true } } },
    });
  }

  // --- N+1 ----------------------------------------------------------------------
  private async estN1(a: Acteur, d: DemandeAbsence): Promise<boolean> {
    if (d.n1Role) {
      // Rôle de direction : seulement celui de la société du demandeur (une
      // Dir. GC d'une autre société du groupe ne décide pas ici).
      const dossier = await this.prisma.dossierPersonnel.findUnique({
        where: { id: d.dossierId },
        select: { societeId: true },
      });
      if (dossier?.societeId !== a.societeId) return false;
      return a.role === d.n1Role || a.role === 'societe_admin';
    }
    const c = await this.prisma.collaborateur.findFirst({
      where: { utilisateurId: a.userId, societeId: a.societeId },
      select: { id: true },
    });
    return !!c && c.id === d.n1CollaborateurId;
  }

  // Demandes dont l'acteur est le N+1 : en attente de sa décision, ou toutes
  // (les plus récentes d'abord, pour l'historique « Toutes »).
  async aValider(a: Acteur, toutes = false) {
    const c = await this.prisma.collaborateur.findFirst({
      where: { utilisateurId: a.userId, societeId: a.societeId },
      select: { id: true },
    });
    const ou: Prisma.DemandeAbsenceWhereInput[] = [];
    if (c) ou.push({ n1CollaborateurId: c.id });
    if (ROLES_N1.includes(a.role)) ou.push({ n1Role: a.role });
    if (a.role === 'societe_admin') ou.push({ n1Role: { in: ROLES_N1 } });
    if (!ou.length) return [];
    const demandes = await this.prisma.demandeAbsence.findMany({
      where: { ...(!toutes && { statut: 'attente_n1' as const }), OR: ou, dossier: { societeId: a.societeId } },
      include: { dossier: { select: { prenom: true, nom: true, poste: true } } },
      orderBy: toutes ? { createdAt: 'desc' } : { dateDebut: 'asc' },
    });
    return demandes.map((d) => ({ ...versAbsence(d), salarie: d.dossier }));
  }

  // Livrables dus pendant l'absence + personnes à qui les confier + alerte
  // cellule (trop d'absents en même temps → « Autres dates » présélectionné).
  async preparationDecision(a: Acteur, id: string) {
    const d = await this.absence(id);
    const salarie = await this.prisma.dossierPersonnel.findUnique({
      where: { id: d.dossierId },
      select: { prenom: true, nom: true, poste: true },
    });
    if (!(await this.estN1(a, d))) throw new ForbiddenException("Vous n'êtes pas le N+1 de cette demande.");
    const collab = await this.collaborateurDe(d.dossierId);
    const livrables = collab ? await this.livrables(collab.id, d.dateDebut, d.dateFin) : [];
    const candidats = await this.prisma.collaborateur.findMany({
      where: { societeId: a.societeId, id: { not: collab?.id } },
      select: { id: true, prenom: true, nom: true, cellule: { select: { nom: true } } },
      orderBy: [{ nom: 'asc' }],
    });
    let alerteCellule = { absents: 0, membres: 0, preselection: false };
    if (collab?.celluleId) {
      const membres = await this.prisma.collaborateur.findMany({
        where: { celluleId: collab.celluleId },
        select: { dossierPersonnel: { select: { absences: { where: { statut: { in: ['accord_n1', 'validee'] } }, select: { dateDebut: true, dateFin: true } } } } },
      });
      const periode = { debut: d.dateDebut, fin: d.dateFin };
      const absents = membres.filter((m) =>
        (m.dossierPersonnel?.absences ?? []).some((x) => chevauche(periode, { debut: x.dateDebut, fin: x.dateFin })),
      ).length;
      alerteCellule = { absents, membres: membres.length, preselection: (absents + 1) / membres.length >= PART_CELLULE_ABSENTE_ALERTE };
    }
    return {
      demande: { ...versAbsence(d), salarie },
      livrables,
      candidats: candidats.map((c) => ({ id: c.id, libelle: `${c.prenom} ${c.nom}`, cellule: c.cellule?.nom ?? null })),
      alerteCellule,
    };
  }

  async decider(a: Acteur, id: string, dto: DecisionN1Dto) {
    const d = await this.absence(id);
    if (!(await this.estN1(a, d))) throw new ForbiddenException("Vous n'êtes pas le N+1 de cette demande.");
    if (d.statut !== 'attente_n1') throw new ConflictException('Demande déjà tranchée.');
    const base = { decisionN1ParId: a.userId, decisionN1Le: new Date(), decisionN1: dto.decision };

    if (dto.decision === 'refuser') {
      if (!dto.motif) throw new BadRequestException('Motif de refus obligatoire.');
      if (dto.motif === 'autre' && !dto.commentaire?.trim()) {
        throw new BadRequestException('Précisez le motif « Autre » en commentaire.');
      }
      return versAbsence(await this.prisma.demandeAbsence.update({
        where: { id },
        data: { ...base, statut: 'refusee', motifRefus: dto.motif, commentaireRefus: dto.commentaire ?? '' },
      }));
    }

    if (dto.decision === 'autres_dates') {
      if (!dto.dateDebut || !dto.dateFin || dto.dateFin < dto.dateDebut) {
        throw new BadRequestException('Proposez une période valide.');
      }
      return versAbsence(await this.prisma.demandeAbsence.update({
        where: { id },
        data: { ...base, statut: 'autres_dates', datesProposeesDebut: dto.dateDebut, datesProposeesFin: dto.dateFin, commentaireRefus: dto.commentaire ?? '' },
      }));
    }

    // valider / sous_conditions : chaque livrable dû pendant l'absence est
    // soit confié à quelqu'un, soit (sous conditions) avancé à la veille du départ.
    const collab = await this.collaborateurDe(d.dossierId);
    const livrables = collab ? await this.livrables(collab.id, d.dateDebut, d.dateFin) : [];
    const nonDelegables = new Set(dto.decision === 'sous_conditions' ? dto.nonDelegables ?? [] : []);
    const delegations = new Map((dto.delegations ?? []).map((x) => [x.livrable, x.collaborateurId]));
    const autorises = new Set(
      (await this.prisma.collaborateur.findMany({ where: { societeId: a.societeId }, select: { id: true } })).map((c) => c.id),
    );
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const journal: { livrable: string; action: 'confie' | 'avance'; a?: string; echeance?: string }[] = [];
    for (const l of livrables) {
      if (nonDelegables.has(l.cle)) {
        const nouvelle = veille(d.dateDebut);
        ops.push(this.majBloc(l, { echeance: nouvelle }));
        journal.push({ livrable: l.cle, action: 'avance', echeance: nouvelle });
        continue;
      }
      const cible = delegations.get(l.cle);
      if (!cible || cible === collab?.id || !autorises.has(cible)) {
        throw new BadRequestException(`Livrable à confier : ${l.projet} · ${l.groupe}.`);
      }
      ops.push(this.majBloc(l, { responsableId: cible }));
      journal.push({ livrable: l.cle, action: 'confie', a: cible });
    }
    ops.push(this.prisma.demandeAbsence.update({
      where: { id },
      data: { ...base, statut: 'accord_n1', traitementLivrables: journal },
    }));
    const res = await this.prisma.$transaction(ops);
    return versAbsence(res[res.length - 1] as DemandeAbsence);
  }

  // --- RH -----------------------------------------------------------------------
  async listeRh() {
    const [absences, remboursements, attestations] = await Promise.all([
      this.prisma.demandeAbsence.findMany({
        include: { dossier: { select: { id: true, prenom: true, nom: true, matricule: true } } },
        orderBy: { dateDebut: 'desc' },
      }),
      this.prisma.demandeRemboursement.findMany({
        include: {
          dossier: { select: { id: true, prenom: true, nom: true, matricule: true } },
          justificatifs: { select: { id: true, nom: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.demandeAttestation.findMany({
        select: {
          id: true,
          demandeLe: true,
          delivreeLe: true,
          nom: true,
          dossier: { select: { id: true, prenom: true, nom: true, matricule: true } },
        },
        orderBy: { demandeLe: 'desc' },
      }),
    ]);
    return { absences: absences.map((d) => ({ ...versAbsence(d), salarie: d.dossier })), remboursements, attestations };
  }

  // Attestation de travail : la RH la délivre en déposant le document signé.
  async delivrerAttestation(a: Acteur, id: string, fichier: { nom: string; url: string }) {
    if (!fichier.url.startsWith('data:')) throw new BadRequestException('Fichier invalide.');
    const { count } = await this.prisma.demandeAttestation.updateMany({
      where: { id, delivreeLe: null },
      data: { delivreeLe: new Date(), delivreeParId: a.userId, nom: fichier.nom, cle: fichier.url },
    });
    if (count === 0) throw new ConflictException('Attestation introuvable ou déjà délivrée.');
    return { ok: true };
  }

  async validationRh(a: Acteur, id: string, valide: boolean, motif?: string) {
    const d = await this.absence(id);
    if (d.statut !== 'accord_n1') throw new ConflictException("Pas d'accord du N+1 à valider.");
    if (!valide && !motif?.trim()) throw new BadRequestException('Motif obligatoire pour un refus.');
    return versAbsence(await this.prisma.demandeAbsence.update({
      where: { id },
      data: valide
        ? { statut: 'validee', valideRhParId: a.userId, valideRhLe: new Date() }
        : { statut: 'refusee', valideRhParId: a.userId, valideRhLe: new Date(), commentaireRefus: motif ?? '' },
    }));
  }

  async transitionRemboursement(
    a: Acteur,
    id: string,
    action: 'transmettre' | 'rembourser' | 'rejeter',
    valeur?: { montantRembourse?: number; motif?: string },
  ) {
    const r = await this.prisma.demandeRemboursement.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Demande introuvable');
    const attendu = action === 'transmettre' ? ['soumise'] : action === 'rembourser' ? ['transmise'] : ['soumise', 'transmise'];
    if (!attendu.includes(r.statut)) throw new ConflictException('Étape déjà franchie.');
    const data: Prisma.DemandeRemboursementUpdateInput =
      action === 'transmettre'
        ? { statut: 'transmise', transmiseLe: new Date(), traiteParId: a.userId }
        : action === 'rembourser'
          ? { statut: 'remboursee', montantRembourse: valeur?.montantRembourse ?? r.montant, traiteLe: new Date(), traiteParId: a.userId }
          : { statut: 'rejetee', motifRejet: valeur?.motif ?? '', traiteLe: new Date(), traiteParId: a.userId };
    return this.prisma.demandeRemboursement.update({ where: { id }, data });
  }

  async justificatif(kind: 'absence' | 'remboursement', id: string) {
    if (kind === 'absence') {
      const d = await this.absence(id);
      if (!d.justificatifCle) throw new NotFoundException('Pas de justificatif');
      return { nom: d.justificatifNom, url: d.justificatifCle };
    }
    const j = await this.prisma.justificatifRemboursement.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('Pas de justificatif');
    return { nom: j.nom, url: j.cle };
  }

  // --- internes -------------------------------------------------------------------
  private async absence(id: string) {
    const d = await this.prisma.demandeAbsence.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Demande introuvable');
    return d;
  }

  private async collaborateurDe(dossierId: string) {
    const dossier = await this.prisma.dossierPersonnel.findUnique({
      where: { id: dossierId },
      select: { collaborateur: { select: { id: true, celluleId: true } } },
    });
    return dossier?.collaborateur ?? null;
  }

  // Blocs dont la personne est responsable, échéance dans la période.
  private async livrables(collaborateurId: string, debut: string, fin: string): Promise<Livrable[]> {
    const dans = { responsableId: collaborateurId, echeance: { gte: debut, lte: fin } };
    const [avp, permis, exe] = await Promise.all([
      this.prisma.blocChecklistAvp.findMany({ where: dans, include: { avantProjet: { select: { projet: { select: { code: true } } } } } }),
      this.prisma.blocPermis.findMany({ where: dans, include: { permis: { select: { projet: { select: { code: true } } } } } }),
      this.prisma.blocExecution.findMany({ where: dans, include: { projet: { select: { code: true } } } }),
    ]);
    return [
      ...avp.map((b) => ({ cle: `avant-projet:${b.avantProjetId}:${b.groupe}`, source: 'avant-projet' as const, projetId: b.avantProjetId, projet: b.avantProjet.projet.code, groupe: b.groupe, echeance: b.echeance! })),
      ...permis.map((b) => ({ cle: `permis:${b.permisId}:${b.groupe}`, source: 'permis' as const, projetId: b.permisId, projet: b.permis.projet.code, groupe: b.groupe, echeance: b.echeance! })),
      ...exe.map((b) => ({ cle: `execution:${b.projetId}:${b.groupe}`, source: 'execution' as const, projetId: b.projetId, projet: b.projet.code, groupe: b.groupe, echeance: b.echeance! })),
    ].sort((x, y) => x.echeance.localeCompare(y.echeance));
  }

  private majBloc(l: Livrable, data: { responsableId?: string; echeance?: string }) {
    if (l.source === 'avant-projet') {
      return this.prisma.blocChecklistAvp.update({ where: { avantProjetId_groupe: { avantProjetId: l.projetId, groupe: l.groupe as never } }, data });
    }
    if (l.source === 'permis') {
      return this.prisma.blocPermis.update({ where: { permisId_groupe: { permisId: l.projetId, groupe: l.groupe as never } }, data });
    }
    return this.prisma.blocExecution.update({ where: { projetId_groupe: { projetId: l.projetId, groupe: l.groupe as never } }, data });
  }
}

function versAbsence(d: DemandeAbsence) {
  const { justificatifCle, ...reste } = d;
  return { ...reste, aJustificatif: !!justificatifCle };
}

