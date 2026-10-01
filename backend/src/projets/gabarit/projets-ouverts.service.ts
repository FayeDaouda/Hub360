import { Injectable, NotFoundException } from '@nestjs/common';
import { JalonFacture, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import type { Temps } from '../../reglages/gabarit';
import { alerteAvenant, refDevis } from '../../devis/domaine';
import { dateDuJour, rangOuvre } from './calendrier';
import {
  attentesFactures,
  etatCarte,
  etatTache,
  indexTaches,
  resumeEtape,
  type CarteSource,
  type EtatTache,
} from './etats';

// Lecture des projets ouverts selon le gabarit (maquette « Projets » du
// boss) : liste, tuiles, et dossier d'un projet — étapes, cartes, tâches et
// leurs états dérivés du jour.

const HEURES_PAR_JOUR = 8;
const nom = (p: { prenom: string; nom: string } | null | undefined) => (p ? `${p.prenom} ${p.nom}` : null);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const aujourdhui = () => new Date().toISOString().slice(0, 10);

const AVEC_TACHES = {
  cartes: {
    orderBy: { ordre: 'asc' },
    include: {
      taches: {
        orderBy: { ordre: 'asc' },
        include: {
          assigne: { select: { id: true, prenom: true, nom: true, cellule: { select: { nom: true } } } },
          valideePar: { select: { prenom: true, nom: true } },
        },
      },
    },
  },
} satisfies Prisma.ProjetInclude;

type ProjetAvecTaches = Prisma.ProjetGetPayload<{ include: typeof AVEC_TACHES }>;

const JALON_PAR_FACTURE: Record<'F1' | 'F2' | 'F3', JalonFacture> = { F1: 'signature', F2: 'avant_projet', F3: 'livraison' };

@Injectable()
export class ProjetsOuvertsService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
  ) {}

  async tableau(societeId: string) {
    const projets = await this.prisma.projet.findMany({
      where: { societeId, ouvertLe: { not: null } },
      orderBy: { ouvertLe: 'asc' },
      include: { ...AVEC_TACHES, client: { select: { nom: true } }, cellules: { include: { cellule: { select: { nom: true } } } } },
    });
    const feries = await this.feries(societeId);
    const jour = aujourdhui();
    const resumes = projets.map((p) => {
      const { etapes } = this.etats(p, jour, feries);
      const somme = (cle: 'faites' | 'total' | 'enRetard') => etapes.reduce((s, e) => s + e[cle], 0);
      return {
        id: p.id,
        code: p.code,
        client: p.client.nom,
        cellule: p.cellules[0]?.cellule.nom ?? null,
        jour: rangOuvre(p.ouvertLe!, jour, feries),
        horizon: this.horizon(p.budgetHeures),
        faites: somme('faites'),
        total: somme('total'),
        enRetard: somme('enRetard'),
      };
    });
    const taches = projets.flatMap((p) => p.cartes.flatMap((c) => c.taches));
    return {
      // En-tête de la page : gabarit et budget atelier en service (Réglages).
      gabarit: 'GC-CONCEPTION',
      budgetHeures: await this.reglages.regle<number>(societeId, 'budget_atelier_heures'),
      projets: resumes,
      kpi: {
        remisesAValider: taches.filter((t) => t.statut === 'a_valider').length,
        tachesEnRetard: resumes.reduce((s, r) => s + r.enRetard, 0),
        // Prolongations et mentions : lots suivants (aucune donnée encore).
        prolongations: 0,
        tsNonAcceptes: await this.tsNonAcceptes(societeId, projets.map((p) => p.id), jour),
        mentions: 0,
      },
    };
  }

  async dossier(societeId: string, projetId: string) {
    const p = await this.prisma.projet.findFirst({
      where: { id: projetId, societeId, ouvertLe: { not: null } },
      include: {
        ...AVEC_TACHES,
        client: { select: { nom: true, type: true } },
        cellules: { include: { cellule: { include: { dispatcher: { select: { id: true, prenom: true, nom: true } } } } } },
        gabaritVersion: { select: { code: true, libelle: true } },
        factures: { where: { estAvoir: false, statut: { not: 'annulee' } }, select: { jalon: true, statut: true } },
        devis: { where: { statut: 'transforme' }, select: { numero: true, dateEnvoi: true }, take: 1 },
        societe: { select: { contratSignataireNom: true } },
      },
    });
    if (!p) throw new NotFoundException('Projet introuvable ou pas encore ouvert');
    const feries = await this.feries(societeId);
    const jour = aujourdhui();
    const { etapes, etatsCartes, etatsTaches } = this.etats(p, jour, feries);
    const cellule = p.cellules[0]?.cellule ?? null;
    const chef = cellule?.dispatcher ?? null;
    const dplg = p.societe.contratSignataireNom?.trim() || null;
    const pilote = await this.reglages.regle<string>(societeId, 'pilote_etudes');
    const horizon = this.horizon(p.budgetHeures);

    // Validation (maquette) : sans temps atelier, le dépôt du justificatif vaut
    // validation ; sinon le chef de team, et l'Architecte DPLG quand la tâche
    // est celle du chef de team.
    const validation = (temps: Temps, assigneId: string | null) =>
      temps.type === 'sans'
        ? { mode: 'depot' as const }
        : chef && assigneId === chef.id
          ? { mode: 'personne' as const, nom: dplg, role: 'tâche du chef de team : Architecte DPLG' }
          : { mode: 'personne' as const, nom: nom(chef), role: 'chef de team' };

    const facture = (f: 'F1' | 'F2' | 'F3') => {
      const fs = p.factures.filter((x) => x.jalon === JALON_PAR_FACTURE[f]);
      return fs.some((x) => x.statut === 'emise') ? 'emise' : fs.length ? 'brouillon' : 'absente';
    };

    return {
      id: p.id,
      code: p.code,
      client: { nom: p.client.nom, type: p.client.type },
      cellule: cellule ? { nom: cellule.nom, chef: nom(chef) } : null,
      pilote: pilote === 'head_of_engineering' ? 'Head of Engineering (à recruter)' : dplg ?? 'Architecte DPLG',
      version: p.gabaritVersion,
      offre: p.devis[0] ? refDevis(p.devis[0].numero, p.devis[0].dateEnvoi) : null,
      ouvertLe: p.ouvertLe,
      livraisonLe: dateDuJour(p.ouvertLe!, horizon, feries),
      jour: rangOuvre(p.ouvertLe!, jour, feries),
      horizon,
      budgetHeures: p.budgetHeures,
      factures: { F1: facture('F1'), F2: facture('F2'), F3: facture('F3') },
      attentes: attentesFactures(etapes, this.sources(p)),
      etapes: etapes.map((e) => {
        const c = p.cartes.find((x) => x.etapeNumero === e.numero)!;
        return { ...e, cle: c.etapeCle, libelle: c.etapeLibelle };
      }),
      cartes: p.cartes.map((c) => ({
        id: c.id,
        etapeNumero: c.etapeNumero,
        etapeLibelle: c.etapeLibelle,
        cle: c.cle,
        libelle: c.libelle,
        note: c.note,
        descriptif: c.descriptif,
        etiquette: c.etiquette,
        debutJ: c.debutJ,
        finJ: c.finJ,
        debutLe: c.debutLe,
        finLe: c.finLe,
        temps: c.temps as Temps | null,
        client: c.client,
        fichiers: c.fichiers,
        etat: etatsCartes.get(c.id)!,
        taches: c.taches.map((t) => ({
          id: t.id,
          cle: t.cle,
          libelle: t.libelle,
          descriptif: t.descriptif,
          sourceNative: t.sourceNative,
          debutJ: t.debutJ,
          finJ: t.finJ,
          debutLe: t.debutLe,
          finLe: t.finLe,
          temps: t.temps as Temps,
          heures: t.heures === null ? null : Number(t.heures),
          statut: t.statut,
          motif: t.motif,
          version: t.version,
          valideeLe: iso(t.valideeLe),
          valideePar: nom(t.valideePar),
          assigne: t.assigne ? { id: t.assigne.id, nom: nom(t.assigne)!, cellule: t.assigne.cellule?.nom ?? null } : null,
          validation: validation(t.temps as Temps, t.assigneId),
          etat: etatsTaches.get(t.id)!,
        })),
      })),
    };
  }

  // --- internes -----------------------------------------------------------------------
  private horizon(budgetHeures: number | null) {
    return Math.max(1, Math.round((budgetHeures ?? 320) / HEURES_PAR_JOUR));
  }

  private async feries(societeId: string) {
    return (await this.reglages.joursFeries([societeId])).get(societeId) ?? new Set<string>();
  }

  private sources(p: ProjetAvecTaches): CarteSource[] {
    return p.cartes.map((c) => ({
      cle: c.cle,
      etapeNumero: c.etapeNumero,
      etapeCle: c.etapeCle,
      fichiers: c.fichiers,
      desactivation: c.desactivation,
      ouvreApres: c.ouvreApres,
      taches: c.taches.map((t) => ({
        cle: t.cle,
        libelle: t.libelle,
        statut: t.statut,
        debutLe: t.debutLe,
        finLe: t.finLe,
        version: t.version,
        valideeLe: iso(t.valideeLe),
      })),
    }));
  }

  private etats(p: ProjetAvecTaches, jour: string, feries: ReadonlySet<string>) {
    const sources = this.sources(p);
    const index = indexTaches(sources);
    const etatsCartes = new Map(p.cartes.map((c, i) => [c.id, etatCarte(sources[i], index)] as const));
    const etatsTaches = new Map<string, EtatTache>();
    const parEtape = new Map<number, { tache: (typeof sources)[number]['taches'][number]; etat: EtatTache }[]>();
    p.cartes.forEach((c, i) => {
      c.taches.forEach((t, j) => {
        const etat = etatTache(sources[i].taches[j], etatsCartes.get(c.id)!, jour, feries);
        etatsTaches.set(t.id, etat);
        parEtape.set(c.etapeNumero, [...(parEtape.get(c.etapeNumero) ?? []), { tache: sources[i].taches[j], etat }]);
      });
      if (!parEtape.has(c.etapeNumero)) parEtape.set(c.etapeNumero, []);
    });
    const etapes = [...parEtape.entries()].sort(([a], [b]) => a - b).map(([n, e]) => resumeEtape(n, e));
    return { etapes, etatsCartes, etatsTaches };
  }

  // Avenants (TS) envoyés et non acceptés au-delà du délai réglé.
  private async tsNonAcceptes(societeId: string, projetIds: string[], jour: string) {
    if (!projetIds.length) return 0;
    const [seuil, devis] = await Promise.all([
      this.reglages.regle<number>(societeId, 'alerte_avenant_jours'),
      this.prisma.devis.findMany({
        where: { societeId, projetId: { in: projetIds }, statut: 'envoye' },
        select: { projetId: true, statut: true, dateValidite: true, dateEnvoi: true, lignes: { select: { produitService: { select: { famille: true } } } } },
      }),
    ]);
    return devis.filter((d) => alerteAvenant({ ...d, familles: d.lignes.map((l) => l.produitService?.famille ?? null) }, jour, seuil)).length;
  }
}
