import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type { Temps } from '../../reglages/gabarit';
import { motifNonAssignable, tachesAssignees } from './assignation';
import { collaborateurDuCompte, peutDecider, peutQualifier, ROLE_DPLG, verifierCircuit } from './validation';

type Acteur = { userId: string };
type ActeurRole = Acteur & { role: string };

// Libellé d'un élément ajouté en TS, selon l'unité de la carte (gabarit).
export const UNITE_TS: Record<'pièce' | 'vue', string> = { pièce: 'Pièce intérieure', vue: 'Vue de détail' };
const nom = (p: { prenom: string; nom: string } | null) => (p ? `${p.prenom} ${p.nom}` : null);

// Écritures sur les tâches d'un projet ouvert (maquette « Projets ») :
// assignation à la tâche ou à la carte, tracée dans l'historique de chaque
// tâche touchée.
@Injectable()
export class TachesProjetService {
  private log = new Logger(TachesProjetService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // Collaborateurs proposés dans « Assigner » (« Moussa Diop · GC-ARC-02 »).
  async assignables(societeId: string) {
    const collaborateurs = await this.prisma.collaborateur.findMany({
      where: { societeId },
      select: { id: true, prenom: true, nom: true, cellule: { select: { nom: true } } },
      orderBy: [{ cellule: { nom: 'asc' } }, { prenom: 'asc' }, { nom: 'asc' }],
    });
    return collaborateurs.map((c) => ({ id: c.id, nom: nom(c)!, cellule: c.cellule?.nom ?? null }));
  }

  async assigner(
    societeId: string,
    acteur: ActeurRole,
    projetId: string,
    tacheId: string,
    collaborateurId: string | null,
    aLaCarte: boolean,
  ) {
    verifierCircuit(acteur.role);
    const tache = await this.prisma.tacheProjet.findFirst({
      where: { id: tacheId, projetId, projet: { societeId, ouvertLe: { not: null } } },
      select: {
        id: true,
        libelle: true,
        statut: true,
        projet: { select: { code: true } },
        carte: { select: { desactivation: true, taches: { select: { id: true, statut: true } } } },
      },
    });
    if (!tache) throw new NotFoundException('Tâche introuvable');
    const collaborateur = collaborateurId
      ? await this.prisma.collaborateur.findFirst({ where: { id: collaborateurId, societeId }, select: { prenom: true, nom: true } })
      : null;
    if (collaborateurId && !collaborateur) throw new NotFoundException('Collaborateur introuvable');

    const desactivee = !!tache.carte.desactivation;
    const choisie = { id: tache.id, statut: tache.statut, carteDesactivee: desactivee };
    const motif = motifNonAssignable(choisie);
    if (motif && !aLaCarte) throw new ConflictException(motif);
    const ids = tachesAssignees(
      choisie,
      tache.carte.taches.map((t) => ({ ...t, carteDesactivee: desactivee })),
      aLaCarte,
    );
    if (!ids.length) throw new ConflictException('Aucune tâche ouverte à assigner dans cette carte.');

    const detail = collaborateur ? `Assignée à ${nom(collaborateur)}` : 'Assignation retirée';
    // Garde en base : une tâche validée entre-temps n'est pas réassignée.
    const modifiees = await this.prisma.$transaction(async (tx) => {
      const cibles = await tx.tacheProjet.findMany({
        where: { id: { in: ids }, statut: { notIn: ['validee', 'non_necessaire'] } },
        select: { id: true },
      });
      const cibleIds = cibles.map((c) => c.id);
      await tx.tacheProjet.updateMany({ where: { id: { in: cibleIds } }, data: { assigneId: collaborateurId } });
      await tx.evenementTacheProjet.createMany({
        data: cibleIds.map((id) => ({ tacheId: id, type: 'assignation' as const, parId: acteur.userId, detail })),
      });
      return cibleIds.length;
    });
    if (collaborateurId && modifiees > 0) {
      const autres = modifiees > 1 ? ` (+ ${modifiees - 1} autre${modifiees > 2 ? 's' : ''})` : '';
      await this.notifications.envoyer({
        societeId,
        type: 'tache_assignee',
        titre: `Tâche assignée · ${tache.projet.code} · ${tache.libelle}${autres}`,
        destinataireIds: await this.notifications.comptesDe([collaborateurId]),
        parId: acteur.userId,
        projetId,
      });
    }
    return { modifiees };
  }

  // Remise (maquette « Projets », vue Salarié) : seul l'assigné remet sa tâche,
  // ouverte (carte non verrouillée), à faire ou en reprise. Sans temps
  // atelier, le dépôt vaut validation (exception écrite au principe 4) ;
  // sinon la remise vNN attend le chef de team (ou le DPLG pour la tâche du chef).
  async remettre(societeId: string, acteur: ActeurRole, projetId: string, tacheId: string) {
    verifierCircuit(acteur.role);
    const tache = await this.prisma.tacheProjet.findFirst({
      where: { id: tacheId, projetId, projet: { societeId, ouvertLe: { not: null } } },
      select: {
        id: true,
        libelle: true,
        statut: true,
        version: true,
        temps: true,
        assigneId: true,
        carte: { select: { desactivation: true, ouvreApres: true } },
        projet: { select: { code: true, cellules: { take: 1, select: { cellule: { select: { dispatcherId: true } } } } } },
      },
    });
    if (!tache) throw new NotFoundException('Tâche introuvable');
    const collaborateurId = await collaborateurDuCompte(this.prisma, societeId, acteur.userId);
    if (!collaborateurId || collaborateurId !== tache.assigneId) throw new ForbiddenException('Seule la personne assignée remet sa tâche.');
    if (tache.statut !== 'a_faire' && tache.statut !== 'reprise') throw new ConflictException('Cette tâche n’attend pas de remise.');
    if (tache.carte.desactivation) throw new ConflictException('Carte désactivée : rien à remettre.');
    if (await this.carteVerrouillee(projetId, tache.carte.ouvreApres)) {
      throw new ConflictException('La carte s’ouvre quand les tâches dont elle dépend sont validées.');
    }

    const version = tache.version + 1;
    const vNN = `v${String(version).padStart(2, '0')}`;
    const depot = (tache.temps as Temps).type === 'sans';
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tacheProjet.updateMany({
        where: { id: tache.id, statut: { in: ['a_faire', 'reprise'] } },
        data: depot
          ? { statut: 'validee', version, valideeLe: new Date(), valideeParId: acteur.userId }
          : { statut: 'a_valider', version },
      });
      if (!count) throw new ConflictException('La tâche a changé entre-temps.');
      await tx.evenementTacheProjet.create({
        data: { tacheId: tache.id, type: 'remise', parId: acteur.userId, detail: `Remise ${vNN}` },
      });
      if (depot) {
        await tx.evenementTacheProjet.create({
          data: { tacheId: tache.id, type: 'validation', parId: acteur.userId, detail: 'Dépôt du justificatif : vaut validation' },
        });
      }
    });

    if (!depot) {
      const chefId = tache.projet.cellules[0]?.cellule.dispatcherId ?? null;
      const valideurs = chefId && chefId !== collaborateurId ? await this.comptesDe([chefId]) : await this.comptesDplg(societeId);
      await this.notifier(societeId, projetId, tache.projet.code, 'tache_remise', `Remise ${vNN} à valider · ${tache.projet.code} · ${tache.libelle}`, acteur.userId, valideurs);
    }
    return { statut: depot ? 'validee' : 'a_valider', version };
  }

  // Valider une remise, ou la renvoyer en reprise (motif) — chef de team,
  // Architecte DPLG (tâches du chef, suppléance) ; jamais sa propre tâche.
  async decider(societeId: string, acteur: ActeurRole, projetId: string, tacheId: string, decision: 'valider' | 'renvoyer', motif?: string) {
    verifierCircuit(acteur.role);
    const tache = await this.prisma.tacheProjet.findFirst({
      where: { id: tacheId, projetId, projet: { societeId, ouvertLe: { not: null } } },
      select: {
        id: true,
        statut: true,
        version: true,
        libelle: true,
        assigneId: true,
        projet: { select: { code: true, cellules: { take: 1, select: { cellule: { select: { dispatcherId: true } } } } } },
      },
    });
    if (!tache) throw new NotFoundException('Tâche introuvable');
    if (tache.statut !== 'a_valider') throw new ConflictException('Aucune remise en attente sur cette tâche.');
    const collaborateurId = await collaborateurDuCompte(this.prisma, societeId, acteur.userId);
    const chefId = tache.projet.cellules[0]?.cellule.dispatcherId ?? null;
    if (!peutDecider({ role: acteur.role, collaborateurId }, tache, chefId)) {
      throw new ForbiddenException(
        collaborateurId && collaborateurId === tache.assigneId
          ? 'On ne valide jamais sa propre tâche.'
          : 'La remise se valide par le chef de team ou l’Architecte DPLG.',
      );
    }
    const vNN = `v${String(tache.version).padStart(2, '0')}`;
    await this.prisma.$transaction(async (tx) => {
      // Garde en base : la remise n'a pas été tranchée entre-temps.
      const { count } = await tx.tacheProjet.updateMany({
        where: { id: tache.id, statut: 'a_valider' },
        data:
          decision === 'valider'
            ? { statut: 'validee', valideeLe: new Date(), valideeParId: acteur.userId }
            : { statut: 'reprise' },
      });
      if (!count) throw new ConflictException('La remise a déjà été tranchée.');
      await tx.evenementTacheProjet.create({
        data:
          decision === 'valider'
            ? { tacheId: tache.id, type: 'validation', parId: acteur.userId, detail: `Remise ${vNN} validée` }
            : { tacheId: tache.id, type: 'reprise', parId: acteur.userId, detail: `Remise ${vNN} renvoyée en reprise : ${motif!.trim()}` },
      });
    });
    if (tache.assigneId) {
      await this.notifier(
        societeId,
        projetId,
        tache.projet.code,
        decision === 'valider' ? 'tache_validee' : 'tache_renvoyee',
        decision === 'valider'
          ? `Remise ${vNN} validée · ${tache.projet.code} · ${tache.libelle}`
          : `Remise ${vNN} renvoyée en reprise · ${tache.projet.code} · ${tache.libelle}`,
        acteur.userId,
        await this.comptesDe([tache.assigneId]),
      );
    }
    return { statut: decision === 'valider' ? 'validee' : 'reprise' };
  }

  // « Ajouter en TS » (Architecte DPLG) : un élément demandé par le client
  // devient une tâche de la carte « par unité » (pièce, vue), avec le temps
  // de la carte, ajouté au budget atelier du projet.
  async ajouterTs(societeId: string, acteur: ActeurRole, projetId: string, carteId: string, element: string) {
    verifierCircuit(acteur.role);
    if (acteur.role !== ROLE_DPLG && acteur.role !== 'societe_admin') {
      throw new ForbiddenException('Ajouter en TS est réservé à l’Architecte DPLG.');
    }
    const carte = await this.prisma.carteProjet.findFirst({
      where: { id: carteId, projetId, projet: { societeId, ouvertLe: { not: null } } },
      select: { id: true, debutJ: true, finJ: true, debutLe: true, finLe: true, temps: true, desactivation: true, taches: { select: { ordre: true } } },
    });
    if (!carte) throw new NotFoundException('Carte introuvable');
    const temps = carte.temps as Temps | null;
    if (carte.desactivation || temps?.type !== 'par_unite') throw new ConflictException('Cette carte ne reçoit pas d’élément en TS.');

    return this.prisma.$transaction(async (tx) => {
      const rang = (await tx.tacheProjet.count({ where: { projetId, cle: { startsWith: 'ts_' } } })) + 1;
      const tache = await tx.tacheProjet.create({
        data: {
          projetId,
          carteId: carte.id,
          cle: `ts_${rang}`,
          libelle: `TS${rang} · ${UNITE_TS[temps.unite]} · ${element.trim()}`,
          ordre: Math.max(-1, ...carte.taches.map((t) => t.ordre)) + 1,
          debutJ: carte.debutJ,
          finJ: carte.finJ,
          debutLe: carte.debutLe,
          finLe: carte.finLe,
          temps: { type: 'heures', heures: temps.heures } satisfies Temps as Prisma.InputJsonValue,
          heures: temps.heures,
        },
        select: { id: true, libelle: true },
      });
      await tx.projet.update({ where: { id: projetId }, data: { budgetHeures: { increment: temps.heures } } });
      return tache;
    });
  }

  // Demande de prolongation (assigné) : nouvelle date + motif. L'échéance de
  // référence reste figée (choix du 06/10/2026) : accordée, la prolongation
  // qualifie le retard jusqu'à cette date.
  async demanderProlongation(societeId: string, acteur: ActeurRole, projetId: string, tacheId: string, jusquau: string, motif: string) {
    verifierCircuit(acteur.role);
    const tache = await this.chargerPourProlongation(societeId, projetId, tacheId);
    const collaborateurId = await collaborateurDuCompte(this.prisma, societeId, acteur.userId);
    if (!collaborateurId || collaborateurId !== tache.assigneId) throw new ForbiddenException('Seule la personne assignée demande une prolongation.');
    if (tache.statut === 'validee' || tache.statut === 'non_necessaire') throw new ConflictException('Tâche close : pas de prolongation.');
    if (tache.carte.desactivation) throw new ConflictException('Carte désactivée : pas de prolongation.');
    if (tache.prolongations.some((p) => p.decision === null)) throw new ConflictException('Une demande de prolongation attend déjà une décision.');
    const plancher = [tache.finLe, tache.prolongations.find((p) => p.decision === 'accordee')?.jusquau].filter((d): d is string => !!d).sort().at(-1);
    if (plancher && jusquau <= plancher) throw new BadRequestException(`La nouvelle date doit dépasser le ${plancher.split('-').reverse().join('/')}.`);

    await this.prisma.$transaction([
      this.prisma.prolongationTache.create({ data: { tacheId: tache.id, jusquau, motif: motif.trim(), demandeParId: acteur.userId } }),
      this.prisma.evenementTacheProjet.create({
        data: { tacheId: tache.id, type: 'prolongation', parId: acteur.userId, detail: `Prolongation demandée jusqu’au ${jusquau.split('-').reverse().join('/')} : ${motif.trim()}` },
      }),
    ]);
    const chefId = tache.projet.cellules[0]?.cellule.dispatcherId ?? null;
    const decideurs = chefId && chefId !== collaborateurId ? await this.comptesDe([chefId]) : await this.comptesDplg(societeId);
    await this.notifier(societeId, projetId, tache.projet.code, 'prolongation_demandee', `Prolongation demandée · ${tache.projet.code} · ${tache.libelle}`, acteur.userId, decideurs);
    return { ok: true };
  }

  // Décision (chef de team, sauf sa propre tâche ; Architecte DPLG partout).
  async deciderProlongation(societeId: string, acteur: ActeurRole, projetId: string, tacheId: string, accorder: boolean) {
    verifierCircuit(acteur.role);
    const tache = await this.chargerPourProlongation(societeId, projetId, tacheId);
    const demande = tache.prolongations.find((p) => p.decision === null);
    if (!demande) throw new ConflictException('Aucune demande de prolongation en attente.');
    const collaborateurId = await collaborateurDuCompte(this.prisma, societeId, acteur.userId);
    const chefId = tache.projet.cellules[0]?.cellule.dispatcherId ?? null;
    if (!peutQualifier({ role: acteur.role, collaborateurId }, tache.assigneId, chefId)) {
      throw new ForbiddenException('Le retard est qualifié par le chef de team ou l’Architecte DPLG, jamais sur sa propre tâche.');
    }
    const date = demande.jusquau.split('-').reverse().join('/');
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.prolongationTache.updateMany({
        where: { id: demande.id, decision: null },
        data: { decision: accorder ? 'accordee' : 'refusee', decideeLe: new Date(), decideeParId: acteur.userId },
      });
      if (!count) throw new ConflictException('La demande a déjà été tranchée.');
      await tx.evenementTacheProjet.create({
        data: { tacheId: tache.id, type: 'prolongation', parId: acteur.userId, detail: accorder ? `Prolongation accordée jusqu’au ${date} (retard qualifié)` : `Prolongation jusqu’au ${date} refusée` },
      });
    });
    if (tache.assigneId) {
      await this.notifier(
        societeId,
        projetId,
        tache.projet.code,
        'prolongation_decidee',
        `Prolongation ${accorder ? 'accordée' : 'refusée'} · ${tache.projet.code} · ${tache.libelle}`,
        acteur.userId,
        await this.comptesDe([tache.assigneId]),
      );
    }
    return { decision: accorder ? 'accordee' : 'refusee' };
  }

  private async chargerPourProlongation(societeId: string, projetId: string, tacheId: string) {
    const tache = await this.prisma.tacheProjet.findFirst({
      where: { id: tacheId, projetId, projet: { societeId, ouvertLe: { not: null } } },
      select: {
        id: true,
        libelle: true,
        statut: true,
        finLe: true,
        assigneId: true,
        carte: { select: { desactivation: true } },
        prolongations: { orderBy: { demandeLe: 'desc' }, select: { id: true, jusquau: true, decision: true } },
        projet: { select: { code: true, cellules: { take: 1, select: { cellule: { select: { dispatcherId: true } } } } } },
      },
    });
    if (!tache) throw new NotFoundException('Tâche introuvable');
    return tache;
  }

  // Une tâche dont dépend la carte (« carte.tâche ») n'est pas encore faite.
  private async carteVerrouillee(projetId: string, refs: string[]): Promise<boolean> {
    for (const ref of refs) {
      const [carte, cle] = ref.split('.');
      const t = await this.prisma.tacheProjet.findFirst({ where: { projetId, cle, carte: { cle: carte } }, select: { statut: true } });
      if (t && t.statut !== 'validee' && t.statut !== 'non_necessaire') return true;
    }
    return false;
  }

  // Comptes HUB des collaborateurs (fiche reliée directement ou via le dossier RH).
  private async comptesDe(collaborateurIds: string[]): Promise<string[]> {
    const c = await this.prisma.collaborateur.findMany({
      where: { id: { in: collaborateurIds } },
      select: { utilisateurId: true, dossierPersonnel: { select: { utilisateurId: true } } },
    });
    return [...new Set(c.flatMap((x) => [x.utilisateurId, x.dossierPersonnel?.utilisateurId].filter((id): id is string => !!id)))];
  }

  // Comptes de l'Architecte DPLG (rôle Dir. GC) de la société.
  private async comptesDplg(societeId: string): Promise<string[]> {
    const r = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId, role: { nom: ROLE_DPLG }, utilisateur: { actif: true } },
      select: { utilisateurId: true },
    });
    return r.map((x) => x.utilisateurId);
  }

  // Best-effort : une notification manquée ne fait pas échouer l'action.
  private async notifier(societeId: string, projetId: string, code: string, type: NotificationType, titre: string, parId: string, destinataireIds: string[]) {
    const cibles = destinataireIds.filter((id) => id !== parId);
    if (!cibles.length) return;
    try {
      await this.notifications.pousser({ societeId, projet: { id: projetId, code, celluleIds: [] }, type, titre, parId, destinataireIds: cibles });
    } catch (e) {
      this.log.error(`Notification ${type} non envoyée : ${e instanceof Error ? e.message : e}`);
    }
  }

  async historique(societeId: string, projetId: string, tacheId: string) {
    const tache = await this.prisma.tacheProjet.findFirst({
      where: { id: tacheId, projetId, projet: { societeId } },
      select: {
        evenements: {
          orderBy: { creeLe: 'asc' },
          select: { id: true, type: true, detail: true, creeLe: true, par: { select: { prenom: true, nom: true } } },
        },
      },
    });
    if (!tache) throw new NotFoundException('Tâche introuvable');
    return tache.evenements.map((e) => ({ id: e.id, type: e.type, detail: e.detail, par: nom(e.par), le: e.creeLe }));
  }
}
