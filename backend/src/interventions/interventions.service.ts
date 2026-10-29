import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TypeInterventionHub } from '@prisma/client';
import { formatDate, todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from '../crm/crm.service';
import { statutDevisEffectif } from '../devis/domaine';
import { hasTemplate, ProjectOpeningService } from '../projects/project-opening.service';
import type { EtatInterventionsDto } from './interventions.dto';

type Intervention = { type: TypeInterventionHub; cible: string; detail: string; motif: string };

// Interventions de l'Administrateur HUB (lot 3, 29/10/2026) : les déblocages
// qu'aucun rôle ne peut faire par le parcours normal. Chacune passe par la
// règle métier existante quand il y en a une (Onboard, ouverture du projet),
// porte un motif et entre au journal d'audit dans la même transaction.
@Injectable()
export class InterventionsService {
  constructor(
    private prisma: PrismaService,
    private crm: CrmService,
    private opening: ProjectOpeningService,
  ) {}

  // État d'un dossier et de son projet, recherchés par leur code (le projet
  // reprend le code du dossier à l'Onboard).
  async state(companyId: string, code: string): Promise<EtatInterventionsDto> {
    const [dossier, project, cells, history] = await Promise.all([
      this.prisma.dossierCrm.findFirst({
        where: { societeId: companyId, code },
        select: {
          id: true,
          code: true,
          statut: true,
          client: { select: { nom: true } },
          offres: { where: { statut: 'accepte' }, select: { id: true }, take: 1 },
          contrat: { select: { statut: true } },
        },
      }),
      this.prisma.projet.findFirst({
        where: { societeId: companyId, code },
        select: {
          id: true,
          code: true,
          ouvertLe: true,
          categorie: true,
          cellules: { select: { cellule: { select: { id: true, nom: true, code: true } } } },
        },
      }),
      this.prisma.cellule.findMany({
        where: { societeId: companyId },
        select: { id: true, nom: true, code: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.interventionHub.findMany({
        where: { societeId: companyId, cible: code },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const names = await this.names(history.map((h) => h.parId));
    return {
      dossier: dossier && {
        id: dossier.id,
        code: dossier.code,
        statut: dossier.statut,
        client: dossier.client.nom,
        offreAcceptee: dossier.offres.length > 0,
        contratSigne: dossier.contrat?.statut === 'signe',
      },
      projet: project && {
        id: project.id,
        code: project.code,
        ouvertLe: project.ouvertLe,
        gabarit: hasTemplate(project.categorie),
        cellules: project.cellules.map((c) => c.cellule),
      },
      cellulesDisponibles: cells,
      historique: history.map((h) => ({
        id: h.id,
        type: h.type,
        detail: h.detail,
        motif: h.motif,
        par: h.parId ? (names.get(h.parId) ?? null) : null,
        le: h.createdAt,
      })),
    };
  }

  // Signature client sautée : l'Onboard du contrat signé (projet créé, offre
  // rattachée, factures préparées), sans contrat.
  async onboardWithoutSignature(companyId: string, dossierId: string, actorId: string, motif: string) {
    const dossier = await this.dossier(companyId, dossierId);
    await this.crm.onboarderParContrat(companyId, dossierId, actorId, async (tx) => {
      await tx.dossierCrmTransition.updateMany({
        where: { dossierId, vers: 'onboard', commentaire: 'Contrat signé.' },
        data: { commentaire: `Signature client sautée par l’Administrateur HUB : ${motif}` },
      });
      await this.record(tx, companyId, actorId, {
        type: 'onboard_sans_signature',
        cible: dossier.code,
        detail: 'Onboard sans contrat signé',
        motif,
      });
    });
    return this.state(companyId, dossier.code);
  }

  // Dossier perdu remis en « Nouveau projet » (fiche de nouveau modifiable).
  // Même garde que « refaire » : aucune offre acceptée ni en attente de réponse.
  async reopenDossier(companyId: string, dossierId: string, actorId: string, motif: string) {
    const dossier = await this.dossier(companyId, dossierId);
    if (dossier.statut !== 'perdu') throw new ConflictException('Seul un dossier perdu se rouvre.');
    const today = todayIso();
    const offers = await this.prisma.devis.findMany({
      where: { dossierCrmId: dossierId, statut: { in: ['envoye', 'accepte'] } },
      select: { statut: true, dateValidite: true },
    });
    if (offers.some((o) => o.statut === 'accepte' || statutDevisEffectif(o, today) === 'envoye')) {
      throw new ConflictException(
        'Une offre est acceptée ou attend la réponse du client : le dossier ne se rouvre pas.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.dossierCrm.updateMany({
        where: { id: dossierId, statut: 'perdu' },
        data: { statut: 'nouveau_projet' },
      });
      if (count === 0) throw new ConflictException('Le dossier vient de changer de statut.');
      await tx.dossierCrmTransition.create({
        data: {
          dossierId,
          de: 'perdu',
          vers: 'nouveau_projet',
          parId: actorId,
          commentaire: `${motif} (Administrateur HUB)`,
        },
      });
      await this.record(tx, companyId, actorId, {
        type: 'reouverture_dossier',
        cible: dossier.code,
        detail: 'Perdu → Nouveau projet',
        motif,
      });
    });
    return this.state(companyId, dossier.code);
  }

  // Ouverture selon le gabarit sans attendre l'émission de F1 : la même que
  // celle de la facturation (J1 = aujourd'hui).
  async openProject(companyId: string, projectId: string, actorId: string, motif: string) {
    const project = await this.project(companyId, projectId);
    if (project.ouvertLe) throw new ConflictException('Ce projet est déjà ouvert.');
    const plan = await this.opening.prepare(projectId, todayIso());
    if (!plan) throw new ConflictException('Pas de gabarit en service pour la catégorie de ce projet.');
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.opening.save(tx, plan))) throw new ConflictException('Ce projet vient d’être ouvert.');
      await this.record(tx, companyId, actorId, {
        type: 'ouverture_projet',
        cible: project.code,
        detail: `J1 le ${formatDate(plan.day1)} · ${plan.cards.length} cartes`,
        motif,
      });
    });
    return this.state(companyId, project.code);
  }

  // Cellules du projet (chef de team, validation des remises, visibilité des
  // Salariés) : la liste donnée remplace l'ensemble ; vide = aucune.
  async setCells(companyId: string, projectId: string, cellIds: string[], actorId: string, motif: string) {
    const project = await this.project(companyId, projectId);
    const ids = [...new Set(cellIds)];
    const cells = await this.prisma.cellule.findMany({
      where: { societeId: companyId, id: { in: ids } },
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' },
    });
    if (cells.length !== ids.length) throw new NotFoundException('Cellule introuvable.');
    await this.prisma.$transaction(async (tx) => {
      await tx.projetCellule.deleteMany({ where: { projetId: projectId } });
      if (ids.length)
        await tx.projetCellule.createMany({ data: ids.map((celluleId) => ({ projetId: projectId, celluleId })) });
      await this.record(tx, companyId, actorId, {
        type: 'cellules_projet',
        cible: project.code,
        detail: cells.length ? `Cellules : ${cells.map((c) => c.nom).join(', ')}` : 'Aucune cellule',
        motif,
      });
    });
    return this.state(companyId, project.code);
  }

  private async dossier(companyId: string, id: string) {
    const d = await this.prisma.dossierCrm.findFirst({
      where: { id, societeId: companyId },
      select: { code: true, statut: true },
    });
    if (!d) throw new NotFoundException('Dossier introuvable.');
    return d;
  }

  private async project(companyId: string, id: string) {
    const p = await this.prisma.projet.findFirst({
      where: { id, societeId: companyId },
      select: { code: true, ouvertLe: true },
    });
    if (!p) throw new NotFoundException('Projet introuvable.');
    return p;
  }

  private record(tx: Prisma.TransactionClient, companyId: string, actorId: string, i: Intervention) {
    return tx.interventionHub.create({ data: { societeId: companyId, parId: actorId, ...i } });
  }

  private async names(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    const users = unique.length
      ? await this.prisma.utilisateur.findMany({
          where: { id: { in: unique } },
          select: { id: true, prenom: true, nom: true },
        })
      : [];
    return new Map(users.map((u) => [u.id, `${u.prenom} ${u.nom}`]));
  }
}
