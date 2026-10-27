import { Injectable } from '@nestjs/common';
import { ProcessusCellule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { ProjectStatesService } from '../projects/project-states.service';
import {
  monthlyLoad,
  cellCode,
  isInProgress,
  onTimeShare,
  companyPrefix,
  tasksInProgress,
  type TeamTask,
} from './teams-rules';
import { photoMembre } from '../auth/profil';
import type { TeamsViewDto } from './teams-view.dto';
import { todayIso, toIsoDay } from '@hub/domain';

const jour = (d: Date | null) => (d ? toIsoDay(d) : null);
const nomDe = (c: { prenom: string; nom: string }) => `${c.prenom} ${c.nom}`;

// Équipes (maquette du boss, oct. 2026) : la page en une lecture —
// indicateurs, cellules (pilote, postes, membres et leur charge), listes
// ouvertes par les indicateurs, prochains codes de la nomenclature.
@Injectable()
export class TeamsService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private projectStates: ProjectStatesService,
  ) {}

  async view(societeId: string): Promise<TeamsViewDto> {
    const aujourdhui = todayIso();
    const [
      societe,
      cellules,
      sansCellule,
      collaborateurs,
      taches,
      projets,
      absencesEnAttente,
      compteurs,
      feries,
      etats,
    ] = await Promise.all([
      this.prisma.societe.findUniqueOrThrow({ where: { id: societeId }, select: { nom: true } }),
      this.prisma.cellule.findMany({
        where: { societeId },
        orderBy: [{ processus: 'asc' }, { numero: 'asc' }],
        include: {
          dispatcher: {
            select: {
              id: true,
              prenom: true,
              nom: true,
              utilisateur: { select: { actif: true } },
              dossierPersonnel: { select: { utilisateur: { select: { actif: true } } } },
            },
          },
          postes: {
            orderBy: { ordre: 'asc' },
            include: { titulaire: { select: { id: true, prenom: true, nom: true } } },
          },
          membres: {
            orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
            include: {
              utilisateur: { select: { photoCle: true } },
              dossierPersonnel: {
                select: {
                  absences: { where: { statut: 'validee' }, select: { dateDebut: true, dateFin: true } },
                  utilisateur: { select: { photoCle: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.collaborateur.findMany({
        where: { societeId, celluleId: null },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
        select: { id: true, prenom: true, nom: true, role: true, niveau: true, dateArrivee: true },
      }),
      this.prisma.collaborateur.findMany({
        where: { societeId },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
        select: { id: true, prenom: true, nom: true, cellule: { select: { code: true } } },
      }),
      this.prisma.tacheProjet.findMany({
        where: { projet: { societeId } },
        select: {
          id: true,
          libelle: true,
          assigneId: true,
          debutLe: true,
          finLe: true,
          heures: true,
          statut: true,
          valideeLe: true,
          projet: { select: { code: true } },
          carte: { select: { etapeLibelle: true } },
          assigne: { select: { prenom: true, nom: true } },
        },
      }),
      this.prisma.projet.findMany({
        where: { societeId },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          programme: true,
          client: { select: { nom: true } },
          cellules: { select: { cellule: { select: { code: true, nom: true } } } },
        },
      }),
      this.prisma.demandeAbsence.count({ where: { statut: 'attente_n1', dossier: { societeId } } }),
      this.prisma.compteurCellule.findMany({ where: { societeId } }),
      this.reglages.joursFeries([societeId]),
      this.projectStates.companyStates(societeId, aujourdhui),
    ]);
    // État de chaque tâche selon la règle commune des projets (Production, reporting).
    const etatDe = new Map(etats.flatMap((p) => [...p.taskStates]));
    const ferieSet = feries.get(societeId) ?? new Set<string>();

    const versTache = (t: (typeof taches)[number]): TeamTask => ({
      debut: t.debutLe,
      echeance: t.finLe,
      heures: t.heures?.toNumber() ?? null,
      statut: t.statut,
      valideeLe: jour(t.valideeLe),
    });
    const tachesDe = (collaborateurId: string) => taches.filter((t) => t.assigneId === collaborateurId).map(versTache);

    const vueCellules = cellules.map((c) => {
      const titulaires = new Map(c.postes.flatMap((p) => (p.titulaire ? [[p.titulaire.id, p.libelle] as const] : [])));
      // Pilote d'abord, puis les titulaires dans l'ordre des postes, puis les autres.
      const rang = (id: string) => {
        if (id === c.dispatcherId) return -1;
        const i = c.postes.findIndex((p) => p.titulaire?.id === id);
        return i < 0 ? c.postes.length : i;
      };
      return {
        id: c.id,
        code: c.code,
        processus: c.processus,
        nom: c.nom,
        clientele: c.clientele,
        statut: c.statut,
        // sansCompte : chef sans compte HUB actif — ses remises remontent au
        // Dir. GC ; à corriger en lui créant un compte (revue Dir. GC).
        pilote: c.dispatcher
          ? {
              id: c.dispatcher.id,
              nom: nomDe(c.dispatcher),
              sansCompte: !c.dispatcher.utilisateur?.actif && !c.dispatcher.dossierPersonnel?.utilisateur?.actif,
            }
          : null,
        pctATemps: onTimeShare(c.membres.flatMap((m) => tachesDe(m.id))),
        postes: c.postes.map((p) => ({
          id: p.id,
          libelle: p.libelle,
          etat: p.etat,
          titulaire: p.titulaire ? { id: p.titulaire.id, nom: nomDe(p.titulaire) } : null,
        })),
        membres: [...c.membres]
          .sort((a, b) => rang(a.id) - rang(b.id))
          .map((m) => {
            const t = tachesDe(m.id);
            const charge = monthlyLoad(
              t,
              (m.dossierPersonnel?.absences ?? []).map((a) => ({ debut: a.dateDebut, fin: a.dateFin })),
              aujourdhui,
              ferieSet,
            );
            return {
              id: m.id,
              nom: nomDe(m),
              role: m.role,
              niveau: m.niveau,
              photoUrl: photoMembre(m),
              // Absence validée par la RH qui couvre aujourd'hui (pastille de l'avatar).
              absentJusquau:
                (m.dossierPersonnel?.absences ?? [])
                  .filter((a) => a.dateDebut <= aujourdhui && aujourdhui <= a.dateFin)
                  .map((a) => a.dateFin)
                  .sort()
                  .pop() ?? null,
              poste: titulaires.get(m.id) ?? null,
              estPilote: c.dispatcherId === m.id,
              taches: charge.taches,
              heures: charge.heures,
              pctATemps: onTimeShare(t),
            };
          }),
      };
    });

    const enCours = taches.flatMap((t) => {
      const etat = etatDe.get(t.id);
      return etat && isInProgress(etat.code) ? [{ ...t, etat }] : [];
    });
    const prefixe = companyPrefix(societe.nom);
    const dernier = new Map(compteurs.map((c) => [c.processus, c.dernier]));

    return {
      indicateurs: {
        cellules: { actives: cellules.filter((c) => c.statut === 'active').length, total: cellules.length },
        salariesAAffecter: sansCellule.length,
        projetsSignes: { total: projets.length, nonAffectes: projets.filter((p) => p.cellules.length === 0).length },
        // Revue CTO (22/10/2026) : des tâches, plus des « étapes » ; les étapes
        // en retard sont celles du reporting de la direction.
        taches: {
          ...tasksInProgress(enCours.map((t) => t.etat.code)),
          etapesEnRetard: etats.reduce((n, p) => n + p.etapes.filter((e) => e.etat === 'en_retard').length, 0),
        },
        absencesEnAttente,
      },
      cellules: vueCellules,
      salariesAAffecter: sansCellule.map((c) => ({
        id: c.id,
        nom: nomDe(c),
        role: c.role,
        niveau: c.niveau,
        dateArrivee: c.dateArrivee,
      })),
      projets: projets.map((p) => ({
        id: p.id,
        code: p.code,
        programme: p.programme,
        client: p.client.nom,
        cellules: p.cellules.map((x) => ({ code: x.cellule.code, nom: x.cellule.nom })),
      })),
      // Tâches en cours, les plus en retard d'abord.
      tachesEnCours: enCours
        .map((t) => ({
          id: t.id,
          projet: t.projet.code,
          etape: t.carte.etapeLibelle,
          libelle: t.libelle,
          assigne: t.assigne ? nomDe(t.assigne) : null,
          echeance: t.finLe,
          enRetard: t.etat.code === 'en_retard',
          // Retard qualifié par une prolongation accordée : pas compté en retard.
          prolongeeJusquau: t.etat.code === 'prolongee' ? t.etat.jusquau : null,
        }))
        .sort((a, b) => (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999')),
      collaborateurs: collaborateurs.map((c) => ({ id: c.id, nom: nomDe(c), cellule: c.cellule?.code ?? null })),
      prochainsCodes: Object.fromEntries(
        Object.values(ProcessusCellule).map((p) => [p, cellCode(prefixe, p, (dernier.get(p) ?? 0) + 1)]),
      ) as Record<ProcessusCellule, string>,
    };
  }
}
