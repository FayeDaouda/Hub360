import { Injectable } from '@nestjs/common';
import { ProcessusCellule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { chargeDuMois, codeCellule, etapesEnCours, partATemps, prefixeSociete, type TacheEquipe } from './equipes-regles';

const jour = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const nomDe = (c: { prenom: string; nom: string }) => `${c.prenom} ${c.nom}`;

// Équipes (maquette du boss, oct. 2026) : la page en une lecture —
// indicateurs, cellules (pilote, postes, membres et leur charge), listes
// ouvertes par les indicateurs, prochains codes de la nomenclature.
@Injectable()
export class EquipesService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
  ) {}

  async vue(societeId: string) {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const [societe, cellules, sansCellule, collaborateurs, taches, projets, absencesEnAttente, compteurs, feries] = await Promise.all([
      this.prisma.societe.findUniqueOrThrow({ where: { id: societeId }, select: { nom: true } }),
      this.prisma.cellule.findMany({
        where: { societeId },
        orderBy: [{ processus: 'asc' }, { numero: 'asc' }],
        include: {
          dispatcher: { select: { id: true, prenom: true, nom: true } },
          postes: { orderBy: { ordre: 'asc' }, include: { titulaire: { select: { id: true, prenom: true, nom: true } } } },
          membres: {
            orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
            include: {
              dossierPersonnel: { select: { absences: { where: { statut: 'validee' }, select: { dateDebut: true, dateFin: true } } } },
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
    ]);
    const ferieSet = feries.get(societeId) ?? new Set<string>();

    const versTache = (t: (typeof taches)[number]): TacheEquipe => ({
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
        pilote: c.dispatcher ? { id: c.dispatcher.id, nom: nomDe(c.dispatcher) } : null,
        pctATemps: partATemps(c.membres.flatMap((m) => tachesDe(m.id))),
        postes: c.postes.map((p) => ({
          id: p.id,
          libelle: p.libelle,
          etat: p.etat,
          titulaire: p.titulaire ? { id: p.titulaire.id, nom: nomDe(p.titulaire) } : null,
        })),
        membres: [...c.membres].sort((a, b) => rang(a.id) - rang(b.id)).map((m) => {
          const t = tachesDe(m.id);
          const charge = chargeDuMois(
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
            photoUrl: m.photoCle,
            poste: titulaires.get(m.id) ?? null,
            estPilote: c.dispatcherId === m.id,
            taches: charge.taches,
            heures: charge.heures,
            pctATemps: partATemps(t),
          };
        }),
      };
    });

    const etapes = etapesEnCours(taches.map(versTache), aujourdhui);
    const prefixe = prefixeSociete(societe.nom);
    const dernier = new Map(compteurs.map((c) => [c.processus, c.dernier]));

    return {
      indicateurs: {
        cellules: { actives: cellules.filter((c) => c.statut === 'active').length, total: cellules.length },
        salariesAAffecter: sansCellule.length,
        projetsSignes: { total: projets.length, nonAffectes: projets.filter((p) => p.cellules.length === 0).length },
        etapes,
        absencesEnAttente,
      },
      cellules: vueCellules,
      salariesAAffecter: sansCellule.map((c) => ({ id: c.id, nom: nomDe(c), role: c.role, niveau: c.niveau, dateArrivee: c.dateArrivee })),
      projets: projets.map((p) => ({
        id: p.id,
        code: p.code,
        programme: p.programme,
        client: p.client.nom,
        cellules: p.cellules.map((x) => ({ code: x.cellule.code, nom: x.cellule.nom })),
      })),
      // Étapes en cours, les plus en retard d'abord.
      etapesEnCours: taches
        .filter((t) => t.statut !== 'validee' && t.statut !== 'non_necessaire' && !!t.debutLe && t.debutLe <= aujourdhui)
        .map((t) => ({
          id: t.id,
          projet: t.projet.code,
          etape: t.carte.etapeLibelle,
          libelle: t.libelle,
          assigne: t.assigne ? nomDe(t.assigne) : null,
          echeance: t.finLe,
          enRetard: !!t.finLe && t.finLe < aujourdhui,
        }))
        .sort((a, b) => (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999')),
      collaborateurs: collaborateurs.map((c) => ({ id: c.id, nom: nomDe(c), cellule: c.cellule?.code ?? null })),
      prochainsCodes: Object.fromEntries(
        Object.values(ProcessusCellule).map((p) => [p, codeCellule(prefixe, p, (dernier.get(p) ?? 0) + 1)]),
      ) as Record<ProcessusCellule, string>,
    };
  }
}
