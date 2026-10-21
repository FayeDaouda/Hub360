import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { refFacture } from '../../projets/domaine/config';
import { ReglagesService } from '../../reglages/reglages.service';
import { MOIS_DEBUT_FEUILLES, moisDe, moisEntre } from '../../rh/regles-temps';
import type { ChangementSource } from '../../rh/regles-salaire';
import { TempsService } from '../../rh/temps.service';
import {
  coutHoraire,
  PARAMETRES,
  parametreAu,
  premierMoisModifiable,
  salaireDuMois,
  statutMarge,
  tauxMarge,
  type CleParametre,
  type LigneParametre,
  type Statut,
} from './regles-rentabilite';

type Acteur = { userId: string; societeId: string; role: string };
type Acces = 'montants' | 'taux';

// Décision 8 (21/10/2026) : les montants (coût, marge) au CFO et au CEO
// seuls — croisés avec les heures visibles dans Projets, ils permettraient de
// recalculer les salaires ; le CTO voit le taux et la couleur ; le CIO et le
// compte d'administration n'ont pas accès (en plus de la matrice).
const ACCES: Record<string, Acces> = { CFO: 'montants', 'CEO (transverse)': 'montants', 'CTO (transverse)': 'taux' };
const ROLE_CFO = 'CFO';

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const jourIso = (d: Date) => d.toISOString().slice(0, 10);
const arrondi = (n: number) => Math.round(n);
const heures1 = (n: number) => Math.round(n * 10) / 10;
const nomDe = (u: { prenom: string; nom: string }) => `${u.prenom} ${u.nom}`.trim();

type LigneHeures = { id: string; projetCode: string; heures: number };
export type EtatDonnees = 'complet' | 'insuffisant' | 'heures_non_suivies';

type Cumul = {
  ht: number;
  cout: number;
  heures: number;
  heuresAttente: number;
  aFacturer: number;
  sansSalaire: Set<string>;
  parSalarie: Map<string, { heures: number; cout: number }>;
  parMois: Map<string, { heures: number; cout: number; ht: number }>;
  derniere: string | null;
};

// Rentabilité par projet, phase 1 (lot 7) : montant HT facturé, coût salarial
// direct des heures contrôlées, marge directe PROVISOIRE, statut par rapport
// à la marge cible, prolongations et reprises. Calculé à la demande depuis
// les données du HUB : rien n'est stocké hors des paramètres.
@Injectable()
export class RentabiliteService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private temps: TempsService,
  ) {}

  private acces(a: Acteur): Acces {
    const acces = ACCES[a.role];
    if (!acces) throw new ForbiddenException('La rentabilité par projet est réservée au CFO, au CEO et au CTO.');
    return acces;
  }

  // --- Calcul ------------------------------------------------------------------

  private async calculer(societeId: string, periode: string | null) {
    const jour = aujourdhui();
    const dansPeriode = (mois: string) => !periode || mois === periode;
    const [projets, factures, brouillons, controles, dossiers, taches, prolongations, reprises, parametres, feries] = await Promise.all([
      this.prisma.projet.findMany({
        where: { societeId },
        select: { id: true, code: true, programme: true, statut: true, phase: true, ouvertLe: true, client: { select: { nom: true } }, _count: { select: { taches: true } } },
        orderBy: { code: 'asc' },
      }),
      // Émises (y compris annulées depuis par un avoir) et avoirs : HT négatif.
      this.prisma.facture.findMany({
        where: { societeId, projetId: { not: null }, emiseLe: { not: null } },
        select: { id: true, projetId: true, numero: true, emiseLe: true, estAvoir: true, statut: true, montantHt: true, libelle: true },
        orderBy: { emiseLe: 'asc' },
      }),
      this.prisma.facture.findMany({
        where: { societeId, projetId: { not: null }, statut: 'brouillon', estAvoir: false, montantHt: { gt: 0 } },
        select: { projetId: true, montantHt: true },
      }),
      this.prisma.controleFeuilleTemps.findMany({ where: { dossier: { societeId } }, select: { dossierId: true, mois: true, detail: true, controleLe: true } }),
      this.prisma.dossierPersonnel.findMany({
        where: { societeId },
        select: { id: true, prenom: true, nom: true, salaires: { where: { statut: 'valide' }, select: { montant: true, dateEffet: true, statut: true, decideLe: true } } },
      }),
      this.prisma.tacheProjet.findMany({ where: { projet: { societeId } }, select: { id: true, projetId: true } }),
      this.prisma.prolongationTache.findMany({ where: { decision: 'accordee', tache: { projet: { societeId } } }, select: { tache: { select: { projetId: true } } } }),
      this.prisma.evenementTacheProjet.findMany({ where: { type: 'reprise', tache: { projet: { societeId } } }, select: { tache: { select: { projetId: true } } } }),
      this.prisma.parametreRentabilite.findMany({ where: { societeId } }),
      this.reglages.joursFeries([societeId]),
    ]);
    const ferieSet = feries.get(societeId) ?? new Set<string>();
    const projetDeTache = new Map(taches.map((t) => [t.id, t.projetId]));
    const projetDeCode = new Map(projets.map((p) => [p.code, p.id]));
    const salaires = new Map(dossiers.map((d) => [d.id, d.salaires as ChangementSource[]]));
    const params = parametres as LigneParametre[];

    const cumuls = new Map<string, Cumul>(
      projets.map((p) => [p.id, { ht: 0, cout: 0, heures: 0, heuresAttente: 0, aFacturer: 0, sansSalaire: new Set(), parSalarie: new Map(), parMois: new Map(), derniere: null }]),
    );
    const mois = (c: Cumul, m: string) => {
      if (!c.parMois.has(m)) c.parMois.set(m, { heures: 0, cout: 0, ht: 0 });
      return c.parMois.get(m)!;
    };
    const plusRecent = (c: Cumul, d: string) => {
      if (!c.derniere || d > c.derniere) c.derniere = d;
    };

    for (const f of factures) {
      const c = cumuls.get(f.projetId!);
      const m = moisDe(jourIso(f.emiseLe!));
      if (!c || !dansPeriode(m)) continue;
      c.ht += f.montantHt.toNumber();
      mois(c, m).ht += f.montantHt.toNumber();
      plusRecent(c, jourIso(f.emiseLe!));
    }
    for (const b of brouillons) {
      const c = cumuls.get(b.projetId!);
      if (c) c.aFacturer += b.montantHt.toNumber();
    }

    // Coût horaire d'un salarié pour un mois (mémoïsé) ; null = pas de salaire.
    const couts = new Map<string, number | null>();
    const coutDe = (dossierId: string, m: string) => {
      const k = `${dossierId}:${m}`;
      if (!couts.has(k)) {
        const salaire = salaireDuMois(salaires.get(dossierId) ?? [], m, ferieSet);
        const debut = `${m}-01`;
        couts.set(k, salaire === null ? null : coutHoraire(salaire, parametreAu(params, 'heures_reference', debut)!, parametreAu(params, 'coefficient_charges', debut)));
      }
      return couts.get(k)!;
    };
    const projetDe = (l: LigneHeures) => projetDeTache.get(l.id) ?? projetDeCode.get(l.projetCode) ?? null;

    // Heures CONTRÔLÉES par la RH (chiffres figés) : seules à compter.
    for (const ctrl of controles) {
      if (!dansPeriode(ctrl.mois)) continue;
      const horaire = coutDe(ctrl.dossierId, ctrl.mois);
      for (const l of (ctrl.detail as { lignes?: LigneHeures[] }).lignes ?? []) {
        const c = cumuls.get(projetDe(l) ?? '');
        if (!c || !l.heures) continue;
        c.heures += l.heures;
        mois(c, ctrl.mois).heures += l.heures;
        plusRecent(c, jourIso(ctrl.controleLe));
        if (horaire === null) {
          c.sansSalaire.add(ctrl.dossierId);
          continue;
        }
        const cout = l.heures * horaire;
        c.cout += cout;
        mois(c, ctrl.mois).cout += cout;
        const s = c.parSalarie.get(ctrl.dossierId) ?? { heures: 0, cout: 0 };
        c.parSalarie.set(ctrl.dossierId, { heures: s.heures + l.heures, cout: s.cout + cout });
      }
    }

    // Heures des mois clos encore à contrôler : affichées, jamais comptées.
    const clos = moisEntre(MOIS_DEBUT_FEUILLES, moisDe(jour)).filter((m) => m < moisDe(jour) && dansPeriode(m));
    for (const m of clos) {
      const { feuilles } = await this.temps.feuilles(m, societeId);
      for (const f of feuilles.filter((x) => x.statut === 'a_controler')) {
        for (const l of f.lignes) {
          const c = cumuls.get(projetDe(l) ?? '');
          if (c && l.heures) c.heuresAttente += l.heures;
        }
      }
    }

    const compte = (lignes: { tache: { projetId: string } }[]) => {
      const n = new Map<string, number>();
      for (const l of lignes) n.set(l.tache.projetId, (n.get(l.tache.projetId) ?? 0) + 1);
      return n;
    };
    const nbProlongations = compte(prolongations);
    const nbReprises = compte(reprises);
    const cible = parametreAu(params, 'marge_cible', jour);

    const lignes = projets.map((p) => {
      const c = cumuls.get(p.id)!;
      const raisons: string[] = [];
      let etat: EtatDonnees = 'complet';
      if (p._count.taches === 0) etat = 'heures_non_suivies';
      else {
        if (c.sansSalaire.size) raisons.push(`${c.sansSalaire.size} salarié(s) sans salaire validé`);
        // Heures de mois clos pas encore contrôlées : le coût serait
        // sous-estimé, la marge gonflée — pas de marge tant qu'il en reste.
        if (c.heuresAttente) raisons.push(`${heures1(c.heuresAttente)} h en attente de contrôle RH`);
        else if (!c.heures) raisons.push('aucune heure contrôlée');
        if (raisons.length) etat = 'insuffisant';
      }
      // Données incomplètes : ni marge ni taux (un coût à zéro donnerait un
      // faux 100 %) — le facturé et le coût connus restent affichés.
      const marge = etat === 'complet' ? c.ht - c.cout : null;
      const taux = marge === null ? null : tauxMarge(c.ht, marge);
      return {
        projet: { id: p.id, code: p.code, programme: p.programme, client: p.client.nom, statut: p.statut, phase: p.phase },
        ht: arrondi(c.ht),
        cout: arrondi(c.cout),
        marge: marge === null ? null : arrondi(marge),
        aFacturer: arrondi(c.aFacturer),
        taux: taux === null ? null : Math.round(taux * 10) / 10,
        statut: statutMarge(taux, cible) as Statut,
        heures: heures1(c.heures),
        heuresAttente: heures1(c.heuresAttente),
        prolongations: nbProlongations.get(p.id) ?? 0,
        reprises: nbReprises.get(p.id) ?? 0,
        etat,
        raisons,
        misAJour: c.derniere,
        _cumul: c,
      };
    });
    return { lignes, params, cible, factures };
  }

  private parametresEnVigueur(params: LigneParametre[]) {
    const jour = aujourdhui();
    return (Object.keys(PARAMETRES) as CleParametre[]).map((cle) => ({
      cle,
      libelle: PARAMETRES[cle].libelle,
      unite: PARAMETRES[cle].unite,
      valeur: parametreAu(params, cle, jour),
      parDefaut: !params.some((p) => p.cle === cle && p.dateEffet <= jour),
    }));
  }

  // --- Vues --------------------------------------------------------------------

  async portefeuille(a: Acteur, periode?: string) {
    const acces = this.acces(a);
    if (periode && !/^\d{4}-\d{2}$/.test(periode)) throw new BadRequestException('Période invalide (AAAA-MM).');
    const { lignes, params } = await this.calculer(a.societeId, periode ?? null);
    // Totaux : projets aux données complètes seulement.
    const complets = lignes.filter((l) => l.etat === 'complet');
    const totaux = {
      ht: complets.reduce((t, l) => t + l.ht, 0),
      cout: complets.reduce((t, l) => t + l.cout, 0),
    };
    const margeTotale = complets.length ? totaux.ht - totaux.cout : null;
    const tauxTotal = margeTotale === null ? null : tauxMarge(totaux.ht, margeTotale);
    return {
      acces,
      periode: periode ?? null,
      calculeLe: new Date(),
      parametres: this.parametresEnVigueur(params),
      projetsComplets: complets.length,
      totaux:
        acces === 'montants'
          ? { ...totaux, marge: margeTotale === null ? null : arrondi(margeTotale), taux: tauxTotal === null ? null : Math.round(tauxTotal * 10) / 10 }
          : { ht: null, cout: null, marge: null, taux: tauxTotal === null ? null : Math.round(tauxTotal * 10) / 10 },
      lignes: lignes.map(({ _cumul, ...l }) => (acces === 'montants' ? l : { ...l, ht: null, cout: null, marge: null, aFacturer: null })),
    };
  }

  async fiche(a: Acteur, projetId: string) {
    const acces = this.acces(a);
    const { lignes, factures, params } = await this.calculer(a.societeId, null);
    const l = lignes.find((x) => x.projet.id === projetId);
    if (!l) throw new NotFoundException('Projet introuvable');
    const { _cumul: c, ...ligne } = l;
    const montants = acces === 'montants';
    const qualite = [
      ...l.raisons,
      ...(l.etat === 'heures_non_suivies' ? ['projet sans gabarit : aucune tâche, donc aucune heure suivie'] : []),
    ];
    return {
      acces,
      parametres: this.parametresEnVigueur(params),
      ...(montants ? ligne : { ...ligne, ht: null, cout: null, marge: null, aFacturer: null }),
      // Honoraires HT par heure contrôlée, coût horaire moyen.
      parHeure: montants && c.heures ? { honoraires: arrondi(c.ht / c.heures), cout: arrondi(c.cout / c.heures) } : null,
      factures: montants
        ? factures
            .filter((f) => f.projetId === projetId)
            .map((f) => ({ id: f.id, reference: refFacture(f), emiseLe: jourIso(f.emiseLe!), estAvoir: f.estAvoir, annulee: f.statut === 'annulee', libelle: f.libelle, ht: f.montantHt.toNumber() }))
        : null,
      mois: [...c.parMois.entries()]
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([m, v]) => ({ mois: m, heures: heures1(v.heures), ...(montants ? { cout: arrondi(v.cout), ht: arrondi(v.ht) } : { cout: null, ht: null }) })),
      salaries: c.parSalarie.size,
      qualite,
    };
  }

  // Détail par salarié : CFO et CEO seulement, à la demande ; chaque salarié
  // affiché est inscrit au journal de la paie (jamais le montant).
  async salaries(a: Acteur, projetId: string) {
    if (this.acces(a) !== 'montants') throw new ForbiddenException('Le détail par salarié est réservé au CFO et au CEO.');
    const { lignes } = await this.calculer(a.societeId, null);
    const l = lignes.find((x) => x.projet.id === projetId);
    if (!l) throw new NotFoundException('Projet introuvable');
    const ids = [...l._cumul.parSalarie.keys(), ...l._cumul.sansSalaire];
    const dossiers = await this.prisma.dossierPersonnel.findMany({ where: { id: { in: ids } }, select: { id: true, prenom: true, nom: true } });
    if (ids.length) await this.prisma.journalPaie.createMany({ data: ids.map((dossierId) => ({ dossierId, action: 'cout_consulte' as const, parId: a.userId })) });
    return dossiers
      .map((d) => {
        const s = l._cumul.parSalarie.get(d.id);
        return { nom: nomDe(d), heures: s ? heures1(s.heures) : null, cout: s ? arrondi(s.cout) : null, sansSalaire: l._cumul.sansSalaire.has(d.id) };
      })
      .sort((x, y) => (y.cout ?? 0) - (x.cout ?? 0));
  }

  // --- Paramètres (CFO seul pour les modifier) -------------------------------------

  async parametres(a: Acteur) {
    this.acces(a);
    const lignes = await this.prisma.parametreRentabilite.findMany({ where: { societeId: a.societeId }, orderBy: [{ dateEffet: 'desc' }, { createdAt: 'desc' }] });
    const auteurs = await this.prisma.utilisateur.findMany({
      where: { id: { in: [...new Set(lignes.map((l) => l.parId).filter((x): x is string => !!x))] } },
      select: { id: true, prenom: true, nom: true },
    });
    const noms = new Map(auteurs.map((u) => [u.id, nomDe(u)]));
    return {
      peutModifier: a.role === ROLE_CFO,
      premierMois: premierMoisModifiable(aujourdhui()),
      enVigueur: this.parametresEnVigueur(lignes as LigneParametre[]),
      definitions: PARAMETRES,
      historique: lignes.map((l) => ({
        cle: l.cle,
        libelle: PARAMETRES[l.cle as CleParametre]?.libelle ?? l.cle,
        valeur: l.valeur,
        dateEffet: l.dateEffet,
        motif: l.motif,
        par: l.parId ? (noms.get(l.parId) ?? null) : null,
        le: l.createdAt,
      })),
    };
  }

  async modifierParametre(a: Acteur, p: { cle: string; valeur: number | null; dateEffet: string; motif: string }) {
    if (a.role !== ROLE_CFO) throw new ForbiddenException('Seul le CFO modifie les paramètres de rentabilité.');
    const def = PARAMETRES[p.cle as CleParametre];
    if (!def) throw new BadRequestException('Paramètre inconnu.');
    if (p.valeur === null && !def.videPermis) throw new BadRequestException(`${def.libelle} : une valeur est obligatoire.`);
    if (p.valeur !== null && (!Number.isFinite(p.valeur) || p.valeur < def.min || p.valeur > def.max)) {
      throw new BadRequestException(`${def.libelle} : de ${def.min} à ${def.max} ${def.unite}.`);
    }
    if (!/^\d{4}-\d{2}-01$/.test(p.dateEffet)) throw new BadRequestException('La date d’effet est le 1er d’un mois.');
    if (p.dateEffet < premierMoisModifiable(aujourdhui())) throw new BadRequestException('Un mois passé ne se réécrit pas : date d’effet à partir du mois en cours.');
    if (p.motif.trim().length < 3) throw new BadRequestException('Le motif est obligatoire.');
    await this.prisma.parametreRentabilite.create({
      data: { societeId: a.societeId, cle: p.cle, valeur: p.valeur, dateEffet: p.dateEffet, motif: p.motif.trim(), parId: a.userId },
    });
    return this.parametres(a);
  }
}
