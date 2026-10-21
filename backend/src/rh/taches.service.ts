import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import type { RemettreTacheDto } from '../projets/gabarit/dto';
import { TachesProjetService } from '../projets/gabarit/taches-projet.service';
import { contexteDecision } from '../projets/gabarit/suppleance';
import { collaborateurDuCompte, peutDecider } from '../projets/gabarit/validation';
import { ouDossierDuCompte } from './mon-compte';
import { arrondi, etatTache, heuresTache, joursAbsents, manqueTache } from './regles-temps';
import { etatValidationGabarit, statsPerformances, statutTache } from './regles-taches';
import { chargerTachesAssignees } from './taches-assignees';

type Acteur = { userId: string; societeId: string; role: string };

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const nomDe = (c: { prenom: string; nom: string }) => `${c.prenom} ${c.nom}`.trim();

// Mon espace · Mes performances, À valider, Ma cellule — sur les tâches du
// gabarit (TacheProjet), depuis oct. 2026. La remise et la validation
// passent par TachesProjetService : mêmes règles que la page Projets
// (l'assigné remet ; le chef de team valide, l'Architecte DPLG supplée ;
// jamais sa propre tâche).
@Injectable()
export class TachesService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private tachesProjet: TachesProjetService,
  ) {}

  // --- Le salarié : ses tâches, leur temps et leur état de validation ----------
  async mesTaches(a: Acteur) {
    const jour = aujourdhui();
    const dossier = await this.prisma.dossierPersonnel.findFirst({
      where: ouDossierDuCompte(a.userId),
      select: { collaborateurId: true, societeId: true, absences: { where: { statut: 'validee' }, select: { dateDebut: true, dateFin: true } } },
    });
    const collabId = dossier?.collaborateurId ?? (await collaborateurDuCompte(this.prisma, a.societeId, a.userId));
    const taches = collabId ? await chargerTachesAssignees(this.prisma, [collabId]) : [];
    const societeId = dossier?.societeId ?? a.societeId;
    const feries = (await this.reglages.joursFeries([societeId])).get(societeId)!;
    const absents = joursAbsents((dossier?.absences ?? []).map((x) => ({ debut: x.dateDebut, fin: x.dateFin })), feries);

    const lignes = taches
      .map((t) => {
        const v = etatValidationGabarit(t);
        const planifiee = !!t.debut && !!t.echeance;
        return {
          id: t.id,
          etape: t.etape,
          carte: t.carte,
          libelle: t.libelle,
          projetId: t.projetId,
          projetCode: t.projetCode,
          projetProgramme: t.projetProgramme,
          projetClient: t.projetClient,
          debut: t.debut,
          echeance: t.echeance,
          dureeStandard: t.heures,
          heuresImputees: planifiee ? arrondi(heuresTache(t, absents, { debut: t.debut!, fin: jour }, feries)) : 0,
          manque: manqueTache(t, absents, feries),
          etat: etatTache(t, jour),
          statut: statutTache(t, v, jour),
          version: t.version,
          remisLe: t.statut === 'a_valider' || t.statut === 'validee' ? t.remisLe : null,
          valideLe: t.valideeLe,
          renvoiMotif: t.renvoiMotif,
        };
      })
      .sort((x, y) => (x.echeance ?? '9999').localeCompare(y.echeance ?? '9999'));

    return { taches: lignes, stats: statsPerformances(lignes) };
  }

  // Statistiques d'une équipe (« Ma cellule ») : mêmes règles que « Mes
  // performances », sur les tâches de tous ses membres.
  async statsEquipe(collaborateurIds: string[]) {
    const jour = aujourdhui();
    const taches = await chargerTachesAssignees(this.prisma, collaborateurIds);
    return statsPerformances(
      taches.map((t) => ({ statut: statutTache(t, etatValidationGabarit(t), jour), echeance: t.echeance, remisLe: t.remisLe })),
    );
  }

  async remettre(a: Acteur, projetId: string, tacheId: string, corps: RemettreTacheDto = {}) {
    await this.tachesProjet.remettre(a.societeId, a, projetId, tacheId, corps);
    return this.mesTaches(a);
  }

  // --- Le valideur : remises qui l'attendent ----------------------------------
  async aValider(a: Acteur) {
    const collaborateurId = await collaborateurDuCompte(this.prisma, a.societeId, a.userId);
    const remises = await this.prisma.tacheProjet.findMany({
      where: { statut: 'a_valider', projet: { societeId: a.societeId, ouvertLe: { not: null } } },
      select: {
        id: true,
        statut: true,
        libelle: true,
        version: true,
        debutLe: true,
        finLe: true,
        assigneId: true,
        assigne: { select: { prenom: true, nom: true } },
        carte: { select: { etapeNumero: true, etapeLibelle: true } },
        projet: { select: { id: true, code: true, programme: true, cellules: { take: 1, select: { cellule: { select: { dispatcherId: true } } } } } },
        evenements: { where: { type: 'remise' }, orderBy: { creeLe: 'desc' }, take: 1, select: { creeLe: true } },
        pieces: { orderBy: { createdAt: 'asc' }, select: { id: true, nom: true, version: true } },
      },
    });
    // Mêmes règles que Projets : suppléance du jour, travail d'un Dir. GC au CTO.
    const ctx = await contexteDecision(this.prisma, a.societeId, new Date().toISOString().slice(0, 10));
    return remises
      .filter((t) =>
        peutDecider(
          { role: a.role, collaborateurId, ctoSupplee: ctx.ctoSupplee },
          { ...t, assigneEstDplg: !!t.assigneId && ctx.dplgCollaborateurs.has(t.assigneId) },
          t.projet.cellules[0]?.cellule.dispatcherId ?? null,
        ),
      )
      .map((t) => ({
        id: t.id,
        etape: `${String(t.carte.etapeNumero).padStart(2, '0')} · ${t.carte.etapeLibelle}`,
        libelle: t.libelle,
        version: t.version,
        projetId: t.projet.id,
        projetCode: t.projet.code,
        projetProgramme: t.projet.programme,
        responsable: t.assigne ? nomDe(t.assigne) : '—',
        debut: t.debutLe,
        echeance: t.finLe,
        remisLe: t.evenements[0]?.creeLe ?? null,
        // Fichiers de la remise à valider (vide = « sans fichier joint »).
        pieces: t.pieces.filter((f) => f.version === t.version).map((f) => ({ id: f.id, nom: f.nom })),
      }))
      .sort((x, y) => (x.remisLe?.getTime() ?? 0) - (y.remisLe?.getTime() ?? 0));
  }

  async piece(a: Acteur, projetId: string, tacheId: string, pieceId: string) {
    await this.tachesProjet.verifierAccesPiece(a.societeId, a, projetId, tacheId);
    return this.tachesProjet.piece(a.societeId, projetId, tacheId, pieceId);
  }

  async decider(a: Acteur, projetId: string, tacheId: string, corps: { decision: 'valider' | 'renvoyer'; motif?: string }) {
    await this.tachesProjet.decider(a.societeId, a, projetId, tacheId, corps.decision, corps.motif);
    return this.aValider(a);
  }
}
