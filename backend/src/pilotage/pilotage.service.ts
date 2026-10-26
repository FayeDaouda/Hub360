import { NotificationsService } from '../notifications/notifications.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type NiveauPermission, type TypeReporting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { TempsService } from '../rh/temps.service';
import { bornesMois, feuilleDuMois, moisDe, moisEntre, MOIS_DEBUT_FEUILLES, type Salarie } from '../rh/regles-temps';
import { partATemps } from '../equipe/equipes-regles';
import { statutDevisEffectif } from '../devis/domaine';
import { ProjetsOuvertsService } from '../projets/gabarit/projets-ouverts.service';
import {
  DECISION_EN_VIGUEUR,
  echeanceReporting,
  evaluer,
  INSTANCES_SAISIE,
  moisAReporter,
  numeroDecision,
  type Objectif,
  pourcentage,
  REPORTINGS,
  statutDecision,
  statutReporting,
} from './pilotage-regles';
import { ChiffresPilotageService } from './chiffres.service';
import { ReportingRhService } from './reporting-rh.service';
import { SuiviReportingService } from './suivi-reporting.service';
import type { ArbitrerDecisionDto, SaisirDecisionDto } from './dto';
import { derniersMois, serieNouveaux, seriesTaches, type Point } from './tendances';
import { agitPourCeo, avecDelegataire } from '../commun/delegation-ceo';
import { addDays, formatDate, formatMonthYear, toIsoDay, todayIso } from '../shared/dates';

export type Acteur = {
  userId: string;
  societeId: string;
  role: string;
  permissions?: Record<string, NiveauPermission>;
};

// Rôles qui saisissent et clôturent les décisions des instances (choix du
// 05/10/2026 : « par fonction », la matrice reste en lecture).
const ROLES_REGISTRE = new Set(['CTO (transverse)', 'CEO (transverse)', 'societe_admin']);
// Revue CTO puis COO (22/10/2026) : pas de reporting CTO → CEO ni COO → CEO ;
// ils proposent une décision, le CEO l'arbitre. Le COO ne fait que proposer.
const ROLE_CTO = 'CTO (transverse)';
const ROLE_CEO = 'CEO (transverse)';
const PROPOSANTS = new Set([ROLE_CTO, 'COO']);
const ARBITRES = new Set([ROLE_CEO, 'societe_admin']);

// Rôles proposés comme responsables d'une décision (fonctions de direction).
const ROLES_RESPONSABLES = ['Dir. GC', 'COO', 'CFO', 'CEO (transverse)', 'CTO (transverse)', 'CIO (transverse)', 'RH'];

// « CTO (transverse) » → « CTO », « Dir. GC » → « Direction GC » (maquette).
export const libelleRole = (role: string) =>
  role === 'Dir. GC' ? 'Direction GC' : role.replace(/\s*\(transverse\)$/, '');

const nomDe = (c: { prenom: string; nom: string }) => `${c.prenom} ${c.nom}`;
const SU = ['SU1', 'SU2', 'SU3'];
// Décision inscrite par le HUB, telle que dérivée de sa source.
type DecisionHub = {
  cle: string;
  date: string;
  instance: string;
  texte: string;
  responsable: string;
  responsableRole: string | null;
  responsableCollaborateurId: string | null;
  echeance: string | null;
  closeLe: Date | null;
};

// Pilotage · tableau de bord Holding (maquettes du boss) : indicateurs du
// manuel contre leurs objectifs (Réglages), reportings mensuels et registre
// des décisions. Tout est dérivé des données du HUB (§3.7).
@Injectable()
export class PilotageService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private temps: TempsService,
    private chiffres: ChiffresPilotageService,
    private notifications: NotificationsService,
    private reportingRh: ReportingRhService,
    private suivi: SuiviReportingService,
    private projetsOuverts: ProjetsOuvertsService,
  ) {}

  async vue(a: Acteur) {
    const jour = todayIso();
    await this.synchroniserRegistre(a.societeId, jour);
    const feuilles = await this.feuillesControlees(a.societeId, jour);
    const [indicateurs, reportings, registre, chiffres, tendances] = await Promise.all([
      this.indicateurs(a.societeId, jour, feuilles),
      this.reportings(a, jour),
      this.registre(a, jour),
      this.chiffres.tuiles(a, jour, feuilles),
      this.tendances(a.societeId, jour),
    ]);
    const suivis = indicateurs.filter((i) => i.evaluation !== 'sans_donnee');
    return {
      mois: formatMonthYear(moisDe(jour)),
      tuiles: {
        horsObjectif: indicateurs.filter((i) => i.evaluation === 'hors_objectif').length,
        suivis: suivis.length,
        reportingsADeposer: reportings.filter((r) => r.statut === 'a_deposer' || r.statut === 'en_retard').length,
        decisionsOuvertes: registre.decisions.filter((d) => d.statut === 'ouverte' || d.statut === 'echeance_depassee')
          .length,
      },
      // Chiffres clés en tête de page, selon la matrice (chiffres.service.ts).
      chiffres,
      // Courbe des 6 derniers mois, par indicateur mesuré au mois.
      indicateurs: indicateurs.map((i) => ({ ...i, tendance: tendances[i.cle] ?? null })),
      reportings,
      ...registre,
    };
  }

  // --- Indicateurs -----------------------------------------------------------

  // Séries mensuelles (6 derniers mois) des indicateurs mesurés au mois.
  private async tendances(societeId: string, jour: string): Promise<Record<string, Point[]>> {
    const mois = derniersMois(moisDe(jour));
    const debut = new Date(`${mois[0]}-01T00:00:00Z`);
    const [leads, taches, charges] = await Promise.all([
      this.prisma.dossierCrm.findMany({
        where: { societeId, categorie: 'conception', createdAt: { gte: debut } },
        select: { createdAt: true },
      }),
      this.prisma.tacheProjet.findMany({
        where: { projet: { societeId }, statut: 'validee', valideeLe: { gte: debut } },
        select: {
          statut: true,
          valideeLe: true,
          finLe: true,
          evenements: { where: { type: 'reprise' }, select: { id: true }, take: 1 },
        },
      }),
      Promise.all(mois.map((m) => this.chargeEquipes(societeId, m, jour))),
    ]);
    const { aTemps, reprises } = seriesTaches(
      mois,
      taches.map((t) => ({
        statut: t.statut,
        valideeLe: t.valideeLe ? toIsoDay(t.valideeLe) : null,
        echeance: t.finLe,
        reprise: t.evenements.length > 0,
      })),
    );
    return {
      nouveaux_projets: serieNouveaux(
        mois,
        leads.map((l) => toIsoDay(l.createdAt)),
      ),
      taches_a_temps: aTemps,
      taux_reprises: reprises,
      // Pas de charge calculable avant la mise en service des feuilles de temps.
      charge_equipes: mois.map((m, i) => ({ mois: m, valeur: m < MOIS_DEBUT_FEUILLES ? null : charges[i] })),
    };
  }

  private async indicateurs(societeId: string, jour: string, feuilles: { total: number; controlees: number }) {
    const mois = moisDe(jour);
    const { debut, fin } = bornesMois(mois);
    const [
      objNouveaux,
      objConversion,
      objATemps,
      objCharge,
      objReprises,
      nouveaux,
      offres,
      taches,
      charge,
      reportings,
      decisions,
    ] = await Promise.all([
      this.reglages.regle<number | null>(societeId, 'objectif_nouveaux_projets'),
      this.reglages.regle<number | null>(societeId, 'objectif_conversion_chantier'),
      this.reglages.regle<number | null>(societeId, 'objectif_taches_a_temps'),
      this.reglages.regle<{ de: number; a: number } | null>(societeId, 'objectif_charge_equipes'),
      this.reglages.regle<number | null>(societeId, 'objectif_taux_reprises'),
      this.prisma.dossierCrm.count({
        where: {
          societeId,
          categorie: 'conception',
          createdAt: { gte: new Date(`${debut}T00:00:00Z`), lte: new Date(`${fin}T23:59:59.999Z`) },
        },
      }),
      this.conversion(societeId),
      this.prisma.tacheProjet.findMany({
        where: { projet: { societeId } },
        select: {
          statut: true,
          finLe: true,
          debutLe: true,
          heures: true,
          valideeLe: true,
          evenements: { where: { type: 'reprise' }, select: { id: true }, take: 1 },
        },
      }),
      this.chargeEquipes(societeId, mois, jour),
      this.prisma.reportingMensuel.findMany({
        where: { societeId },
        select: { type: true, mois: true, deposeLe: true },
      }),
      this.prisma.decisionRegistre.findMany({
        where: { societeId, closeLe: null, ...DECISION_EN_VIGUEUR },
        select: { echeance: true, closeLe: true },
      }),
    ]);

    const { signees, avecSuivi } = offres;
    const validees = taches.filter((t) => t.statut === 'validee');
    const aTemps = partATemps(
      taches.map((t) => ({
        debut: t.debutLe,
        echeance: t.finLe,
        heures: t.heures == null ? null : Number(t.heures),
        statut: t.statut,
        valideeLe: t.valideeLe ? toIsoDay(t.valideeLe) : null,
      })),
    );
    // Reportings dus : déposés, ou dont l'échéance (J+5) est passée — un
    // reporting non déposé à temps compte comme manqué (0 / 2 si aucun).
    const types: TypeReporting[] = ['direction', 'rh'];
    const dus = moisAReporter(jour).flatMap((mois) =>
      types.flatMap((type) => {
        const depot = reportings.find((r) => r.type === type && r.mois === mois);
        if (!depot && jour <= echeanceReporting(mois)) return [];
        return [{ aLHeure: !!depot && toIsoDay(depot.deposeLe) <= echeanceReporting(mois) }];
      }),
    );
    const aLHeureReportings = dus.filter((r) => r.aLHeure).length;
    const depassees = decisions.filter(
      (d) => statutDecision({ echeance: d.echeance, closeLe: null }, jour) === 'echeance_depassee',
    ).length;

    const indicateur = (
      cle: string,
      titre: string,
      valeur: number | null,
      affichage: string,
      objectif: Objectif,
      texteObjectif: string,
      source: string,
    ) => ({ cle, titre, valeur, affichage, ...evaluer(valeur, objectif), objectif, texteObjectif, source });

    const pct = (v: number | null) => (v == null ? '—' : `${v} %`);
    const conversion = pourcentage(avecSuivi, signees);
    const reprises = pourcentage(validees.filter((t) => t.evenements.length > 0).length, validees.length);
    const ponctualite = pourcentage(aLHeureReportings, dus.length);
    const controle = pourcentage(feuilles.controlees, feuilles.total);

    return [
      indicateur(
        'nouveaux_projets',
        `Nouveaux projets de conception · ${formatMonthYear(mois)}`,
        nouveaux,
        objNouveaux == null ? String(nouveaux) : `${nouveaux} / ${objNouveaux}`,
        { type: 'minimum', valeur: objNouveaux },
        objNouveaux == null ? 'Objectif à fixer dans Réglages' : `Objectif : ${objNouveaux} par mois (manuel §7.2)`,
        'CRM · leads de catégorie Conception créés ce mois',
      ),
      indicateur(
        'conversion',
        'Conversion en suivi de chantier',
        conversion,
        pct(conversion),
        { type: 'minimum', valeur: objConversion },
        objConversion == null ? 'Objectif à fixer dans Réglages' : `Objectif : ${objConversion} % (manuel §7.2)`,
        signees ? `Offres signées contenant SU1 à SU3 · ${avecSuivi} / ${signees}` : 'Aucune offre signée',
      ),
      indicateur(
        'taux_reprises',
        'Taux de reprises',
        reprises,
        pct(reprises),
        { type: 'maximum', valeur: objReprises },
        objReprises == null
          ? 'Indicateur qualité (manuel §2.1) · seuil à fixer dans Réglages'
          : `Seuil maximum : ${objReprises} % (manuel §2.1)`,
        'Projets · tâches validées ayant eu au moins une reprise',
      ),
      indicateur(
        'taches_a_temps',
        'Tâches validées à temps',
        aTemps,
        pct(aTemps),
        { type: 'minimum', valeur: objATemps, propose: 90 },
        objATemps == null ? 'Objectif proposé : 90 % · à fixer dans Réglages' : `Objectif : ${objATemps} %`,
        "Projets · remise validée comparée à l'échéance de référence",
      ),
      indicateur(
        'charge_equipes',
        `Charge des équipes · ${formatMonthYear(mois)}`,
        charge,
        pct(charge),
        { type: 'zone', de: objCharge?.de ?? null, a: objCharge?.a ?? null, propose: { de: 70, a: 100 } },
        objCharge == null
          ? 'Zone proposée : 70 à 100 % · à fixer dans Réglages'
          : `Zone : ${objCharge.de} à ${objCharge.a} %`,
        'Durées standard des tâches assignées, réparties sur leur fenêtre',
      ),
      indicateur(
        'reportings_j5',
        'Reportings déposés à J+5',
        ponctualite,
        dus.length ? `${aLHeureReportings} / ${dus.length}` : '—',
        { type: 'minimum', valeur: 100 },
        'Objectif : 100 % (manuel §4.3)',
        dus.length ? `${aLHeureReportings} déposé(s) à l'heure sur ${dus.length} dû(s)` : 'Aucun reporting encore dû',
      ),
      indicateur(
        'feuilles_controlees',
        'Feuilles de temps contrôlées',
        controle,
        pct(controle),
        { type: 'minimum', valeur: 100 },
        'Objectif : 100 % des mois clos',
        feuilles.total
          ? `${feuilles.controlees} / ${feuilles.total} feuilles des mois clos`
          : 'Aucune feuille à contrôler',
      ),
      {
        cle: 'decisions_ouvertes',
        titre: 'Décisions ouvertes au registre',
        valeur: decisions.length,
        affichage: String(decisions.length),
        evaluation: depassees > 0 ? ('hors_objectif' as const) : ('dans_objectif' as const),
        atteintPropose: false,
        texteObjectif: 'Chaque décision a un responsable et une échéance (manuel §4.1)',
        source: `${depassees} échéance(s) dépassée(s)`,
      },
    ];
  }

  // Offres signées (leads du CRM) et, parmi elles, celles qui contiennent un
  // suivi de chantier (SU1 à SU3).
  private async conversion(societeId: string) {
    const offres = await this.prisma.devis.findMany({
      where: { societeId, dossierCrmId: { not: null }, statut: { in: ['accepte', 'transforme'] } },
      select: { lignes: { select: { produitService: { select: { code: true } } } } },
    });
    return {
      signees: offres.length,
      avecSuivi: offres.filter((o) => o.lignes.some((l) => SU.includes(l.produitService?.code ?? ''))).length,
    };
  }

  // Charge du mois : heures standard des tâches assignées (gabarit), réparties
  // sur leur fenêtre, rapportées aux heures disponibles des membres des
  // cellules (calcul RH, jusqu'à aujourd'hui pour le mois en cours).
  private async chargeEquipes(societeId: string, mois: string, jour: string): Promise<number | null> {
    const [membres, feries] = await Promise.all([
      this.prisma.collaborateur.findMany({
        where: { societeId, celluleId: { not: null } },
        select: {
          tachesProjet: {
            where: { statut: { not: 'non_necessaire' } },
            select: { id: true, debutLe: true, finLe: true, heures: true },
          },
          dossierPersonnel: {
            select: {
              dateEntree: true,
              archiveLe: true,
              absences: { where: { statut: 'validee' }, select: { dateDebut: true, dateFin: true } },
            },
          },
        },
      }),
      this.reglages.joursFeries([societeId]),
    ]);
    const ferieSet = feries.get(societeId) ?? new Set<string>();
    let imputees = 0;
    let disponibles = 0;
    for (const m of membres) {
      const d = m.dossierPersonnel;
      const salarie: Salarie = {
        dateEntree: d?.dateEntree ?? null,
        dateSortie: d?.archiveLe ? toIsoDay(d.archiveLe) : null,
        absences: (d?.absences ?? []).map((x) => ({ debut: x.dateDebut, fin: x.dateFin })),
      };
      const taches = m.tachesProjet.map((t) => ({
        id: t.id,
        debut: t.debutLe,
        echeance: t.finLe,
        heures: t.heures == null ? null : Number(t.heures),
      }));
      const f = feuilleDuMois(mois, salarie, taches, jour, ferieSet);
      imputees += f.heuresImputees;
      disponibles += f.heuresDisponibles;
    }
    return pourcentage(imputees, disponibles);
  }

  // Feuilles des mois clos de la société à contrôler, et contrôlées (page RH).
  private async feuillesControlees(societeId: string, jour: string) {
    const clos = moisEntre(MOIS_DEBUT_FEUILLES, moisDe(jour)).filter((m) => m < moisDe(jour));
    const parMois = await Promise.all(clos.map((m) => this.temps.feuilles(m, societeId)));
    const feuilles = parMois
      .flatMap((p) => p.feuilles)
      .filter((f) => f.statut === 'a_controler' || f.statut === 'controlee');
    return { total: feuilles.length, controlees: feuilles.filter((f) => f.statut === 'controlee').length };
  }

  // --- Étapes des projets ouverts (contenu du reporting) ------------------

  // Étapes des projets ouverts : état commun des projets (Production, Équipes).
  private etapesProjets(societeId: string, jour: string) {
    return this.projetsOuverts.etatsSociete(societeId, jour);
  }

  // Reporting {société} prérempli depuis le HUB pour un mois clos.
  // Public : repris par la synthèse mensuelle du CEO (même calcul).
  async contenuDirection(societeId: string, mois: string, jour: string) {
    const { debut, fin } = bornesMois(mois);
    const [projets, remises, conversion, objectifConversion, charge] = await Promise.all([
      this.etapesProjets(societeId, jour),
      this.prisma.evenementTacheProjet.count({
        where: {
          type: 'remise',
          tache: { projet: { societeId } },
          creeLe: { gte: new Date(`${debut}T00:00:00Z`), lte: new Date(`${fin}T23:59:59.999Z`) },
        },
      }),
      this.conversion(societeId),
      this.reglages.regle<number | null>(societeId, 'objectif_conversion_chantier'),
      this.chargeEquipes(societeId, mois, jour),
    ]);
    const enCours = projets.filter((p) => p.etapes.some((e) => e.etat !== 'terminee'));
    const closes = projets.flatMap((p) =>
      p.etapes.filter((e) => e.closeLe && moisDe(e.closeLe) === mois).map((e) => `${p.code} · ${e.libelle}`),
    );
    const enRetard = projets.reduce((n, p) => n + p.etapes.filter((e) => e.etat === 'en_retard').length, 0);
    const tauxConversion = pourcentage(conversion.avecSuivi, conversion.signees);
    return [
      {
        libelle: 'Projets en cours',
        valeur: enCours.length ? `${enCours.length} · ${enCours.map((p) => p.code).join(', ')}` : '0',
      },
      { libelle: 'Livrables émis', valeur: `${remises} document(s) déposé(s) dans le mois` },
      { libelle: 'Étapes closes', valeur: closes.length ? closes.join(' ; ') : 'Aucune' },
      { libelle: 'Étapes en retard', valeur: `${enRetard} en retard` },
      {
        libelle: 'Conversion en suivi de chantier',
        valeur: `${tauxConversion == null ? '—' : `${tauxConversion} %`}${objectifConversion == null ? '' : ` (objectif ${objectifConversion} %)`}`,
      },
      { libelle: 'Charge des équipes', valeur: charge == null ? '—' : `${charge} % d'occupation moyenne` },
    ];
  }

  // --- Reportings ----------------------------------------------------------

  private contenuDe(type: TypeReporting, societeId: string, mois: string, jour: string) {
    return type === 'direction'
      ? this.contenuDirection(societeId, mois, jour)
      : this.reportingRh.contenu(societeId, mois);
  }

  private async reportings(a: Acteur, jour: string) {
    const [societe, deposes] = await Promise.all([
      this.prisma.societe.findUniqueOrThrow({ where: { id: a.societeId }, select: { nom: true } }),
      this.prisma.reportingMensuel.findMany({ where: { societeId: a.societeId } }),
    ]);
    const types: TypeReporting[] = ['direction', 'rh'];
    // Le plus récent en premier ; le reporting de la société avant le RH.
    const lignes = [...moisAReporter(jour)]
      .reverse()
      .flatMap((mois) =>
        types.map((type) => ({ mois, type, depot: deposes.find((d) => d.type === type && d.mois === mois) ?? null })),
      );
    // Suivi des dépôts (lu, questions) : une requête pour tous.
    const suivis = await this.suivi.suivi(
      a,
      lignes.flatMap(({ type, depot }) => (depot ? [{ id: depot.id, type }] : [])),
    );
    return Promise.all(
      lignes.map(async ({ mois, type, depot }) => {
        const deposeLe = depot ? toIsoDay(depot.deposeLe) : null;
        const statut = statutReporting(mois, deposeLe, jour);
        const { emetteur, destinataire } = REPORTINGS[type];
        // Prérempli tant qu'il n'est pas déposé ; figé ensuite.
        const contenu = depot
          ? ((depot.contenu as { libelle: string; valeur: string }[] | null) ?? null)
          : await this.contenuDe(type, a.societeId, mois, jour);
        return {
          type,
          mois,
          periode: formatMonthYear(mois),
          titre: type === 'direction' ? `Reporting ${societe.nom}` : 'Reporting RH',
          emetteur: libelleRole(emetteur),
          destinataire: libelleRole(destinataire),
          echeance: echeanceReporting(mois),
          statut,
          deposeLe,
          contenu,
          analyse: depot?.analyse ?? null,
          peutDeposer: !depot && a.role === emetteur,
          suivi: depot ? (suivis.get(depot.id) ?? null) : null,
        };
      }),
    );
  }

  // Reportings que l'acteur doit encore déposer, sans leur contenu (léger) :
  // « À traiter aujourd'hui » de la page RH (revue RH 20/10/2026).
  async aDeposer(a: Acteur) {
    const jour = todayIso();
    const types = (Object.keys(REPORTINGS) as TypeReporting[]).filter((t) => REPORTINGS[t].emetteur === a.role);
    if (!types.length) return [];
    const deposes = await this.prisma.reportingMensuel.findMany({
      where: { societeId: a.societeId, type: { in: types } },
      select: { type: true, mois: true },
    });
    return moisAReporter(jour).flatMap((mois) =>
      types
        .filter((type) => !deposes.some((d) => d.type === type && d.mois === mois))
        .map((type) => ({
          type,
          mois,
          periode: formatMonthYear(mois),
          echeance: echeanceReporting(mois),
          statut: statutReporting(mois, null, jour),
        })),
    );
  }

  // Reportings reçus par l'acteur (destinataire) pour le dernier mois clos :
  // « À valider aujourd'hui » du CFO (revue CFO, 20/10/2026).
  async recus(a: Acteur) {
    const types = (Object.keys(REPORTINGS) as TypeReporting[]).filter((t) => REPORTINGS[t].destinataire === a.role);
    const mois = moisAReporter(todayIso()).at(-1);
    if (!types.length || !mois) return [];
    const deposes = await this.prisma.reportingMensuel.findMany({
      where: { societeId: a.societeId, type: { in: types }, mois },
      select: {
        type: true,
        mois: true,
        deposeLe: true,
        lectures: { where: { lecteurId: a.userId }, select: { id: true } },
      },
    });
    return deposes.map((d) => ({
      type: d.type,
      mois: d.mois,
      periode: formatMonthYear(d.mois),
      deposeLe: toIsoDay(d.deposeLe),
      emetteur: libelleRole(REPORTINGS[d.type].emetteur),
      lu: d.lectures.length > 0,
    }));
  }

  async deposer(a: Acteur, type: TypeReporting, mois: string, analyse: string) {
    const jour = todayIso();
    if (!REPORTINGS[type]) throw new NotFoundException('Reporting inconnu.');
    if (a.role !== REPORTINGS[type].emetteur) {
      throw new ForbiddenException(`Seul l’émetteur (${libelleRole(REPORTINGS[type].emetteur)}) dépose ce reporting.`);
    }
    if (!moisAReporter(jour).includes(mois))
      throw new BadRequestException('Seul le reporting d’un mois clos se dépose.');
    // Validée côté DTO, mais des espaces seuls ne font pas une analyse.
    if (analyse.trim().length < 10)
      throw new BadRequestException('L’analyse est obligatoire (10 caractères au moins).');
    const contenu = await this.contenuDe(type, a.societeId, mois, jour);
    try {
      await this.prisma.reportingMensuel.create({
        data: { societeId: a.societeId, type, mois, deposeParId: a.userId, contenu, analyse: analyse.trim() },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException('Reporting déjà déposé.');
      throw e;
    }
    // Le destinataire est prévenu du dépôt (revue Dir. GC, 21/10/2026, lot 3).
    const auteur = await this.prisma.utilisateur.findUnique({
      where: { id: a.userId },
      select: { prenom: true, nom: true },
    });
    const [an, mm] = mois.split('-');
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'reporting_depose',
      titre: `${type === 'rh' ? 'Reporting RH' : 'Reporting de la direction'} de ${new Date(Date.UTC(Number(an), Number(mm) - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })} déposé${auteur ? ` par ${auteur.prenom} ${auteur.nom}` : ''} · à lire`,
      destinataireIds: (await this.notifications.titulairesRole(a.societeId, REPORTINGS[type].destinataire)).filter(
        (id) => id !== a.userId,
      ),
      parId: a.userId,
    });
    return this.vue(a);
  }

  // --- Registre des décisions ---------------------------------------------

  private async registre(a: Acteur, jour: string) {
    const saisir = ROLES_REGISTRE.has(a.role) || PROPOSANTS.has(a.role);
    const [decisions, collaborateurId, rolesPourvus, collaborateurs, rattachables] = await Promise.all([
      this.prisma.decisionRegistre.findMany({
        where: { societeId: a.societeId },
        orderBy: { numero: 'desc' },
        include: {
          projet: { select: { code: true } },
          cellule: { select: { nom: true } },
          client: { select: { nom: true } },
        },
      }),
      this.collaborateurDuCompte(a),
      // Responsable : toujours quelqu'un qui a un compte HUB (revue CTO) — un
      // rôle pourvu, ou une personne dont le compte est actif.
      Promise.all(
        ROLES_RESPONSABLES.map(async (r) =>
          (await this.notifications.titulairesRole(a.societeId, r)).length ? r : null,
        ),
      ),
      this.prisma.collaborateur.findMany({
        where: {
          societeId: a.societeId,
          OR: [{ utilisateur: { actif: true } }, { dossierPersonnel: { utilisateur: { actif: true } } }],
        },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
        select: { id: true, prenom: true, nom: true },
      }),
      saisir ? this.rattachables(a.societeId) : null,
    ]);
    const auteurs = await this.nomsComptes(
      decisions.filter((d) => d.proposition).flatMap((d) => [d.creeParId, d.arbitreParId]),
    );
    // Délégataire du CEO en fonction (revue CEO) : il arbitre, sauf ses propres propositions.
    const delegue = !ARBITRES.has(a.role) && (await agitPourCeo(this.prisma, a));
    return {
      decisions: decisions.map((d) => ({
        id: d.id,
        numero: numeroDecision(d.numero),
        date: d.date,
        instance: d.instance,
        origine: d.origine,
        texte: d.texte,
        responsable: d.responsable,
        echeance: d.echeance,
        statut: statutDecision(
          { echeance: d.echeance, closeLe: d.closeLe ? toIsoDay(d.closeLe) : null, proposition: d.proposition },
          jour,
        ),
        rattachement: rattachementDe(d),
        closeLe: d.closeLe ? toIsoDay(d.closeLe) : null,
        peutCloturer: d.origine === 'saisie' && !d.closeLe && enVigueur(d) && this.peutCloturer(a, d, collaborateurId),
        // Proposition CTO → CEO : qui l'a soumise, qui l'a tranchée, et ce qui a changé.
        proposition: d.proposition
          ? {
              etat: d.proposition,
              par: (d.creeParId && auteurs.get(d.creeParId)) ?? null,
              arbitreLe: d.arbitreLe ? toIsoDay(d.arbitreLe) : null,
              arbitrePar: (d.arbitreParId && auteurs.get(d.arbitreParId)) ?? null,
              motif: d.motifArbitrage,
              initiale:
                (d.proposeeInitiale as { texte: string; responsable: string; echeance: string | null } | null) ?? null,
            }
          : null,
        peutArbitrer: d.proposition === 'proposee' && (ARBITRES.has(a.role) || (delegue && d.creeParId !== a.userId)),
        responsableRole: d.responsableRole,
        responsableCollaborateurId: d.responsableCollaborateurId,
      })),
      saisie: saisir
        ? {
            instances: [...INSTANCES_SAISIE],
            responsables: [
              ...rolesPourvus.filter((r): r is string => !!r).map((r) => ({ role: r, libelle: libelleRole(r) })),
              ...collaborateurs.map((c) => ({ collaborateurId: c.id, libelle: nomDe(c) })),
            ],
            rattachables,
            peutProposer: PROPOSANTS.has(a.role),
            peutInscrire: ROLES_REGISTRE.has(a.role),
          }
        : null,
    };
  }

  private async nomsComptes(ids: (string | null)[]): Promise<Map<string, string>> {
    const uniques = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniques.length) return new Map();
    const comptes = await this.prisma.utilisateur.findMany({
      where: { id: { in: uniques } },
      select: { id: true, prenom: true, nom: true },
    });
    return new Map(comptes.map((u) => [u.id, nomDe(u)]));
  }

  private peutCloturer(
    a: Acteur,
    d: { responsableRole: string | null; responsableCollaborateurId: string | null },
    collaborateurId: string | null,
  ) {
    if (ROLES_REGISTRE.has(a.role)) return true;
    if (d.responsableRole && d.responsableRole === a.role) return true;
    return !!collaborateurId && d.responsableCollaborateurId === collaborateurId;
  }

  // Fiche d'équipe du compte connecté (directe, ou via son dossier RH).
  private async collaborateurDuCompte(a: Acteur): Promise<string | null> {
    const c = await this.prisma.collaborateur.findFirst({
      where: {
        societeId: a.societeId,
        OR: [{ utilisateurId: a.userId }, { dossierPersonnel: { utilisateurId: a.userId } }],
      },
      select: { id: true },
    });
    return c?.id ?? null;
  }

  async saisir(a: Acteur, dto: SaisirDecisionDto) {
    if (dto.proposer && !PROPOSANTS.has(a.role))
      throw new ForbiddenException('Proposer une décision au CEO est réservé au CTO et au COO.');
    if (!dto.proposer && !ROLES_REGISTRE.has(a.role)) {
      throw new ForbiddenException(
        PROPOSANTS.has(a.role)
          ? 'Vos décisions passent par le CEO : proposez-la-lui.'
          : 'Saisir une décision est réservé au CTO et au CEO.',
      );
    }
    const jour = todayIso();
    const date = dto.date ?? jour;
    if (date > jour) throw new BadRequestException('Une décision ne peut pas être datée dans le futur.');
    if (dto.echeance < date) throw new BadRequestException('L’échéance précède la date de la décision.');
    const responsable = await this.responsable(a.societeId, dto);
    const rattachement = await this.rattachementSaisi(a.societeId, dto);
    const arbitres = dto.proposer ? await this.notifications.titulairesRole(a.societeId, ROLE_CEO) : [];
    if (dto.proposer && !arbitres.length)
      throw new BadRequestException(
        'Aucun compte HUB actif ne porte le rôle CEO : la proposition ne serait jamais reçue.',
      );
    const creee = await this.creerNumerotee(a.societeId, (numero) => ({
      ...rattachement,
      societeId: a.societeId,
      numero,
      date,
      instance: dto.instance,
      origine: 'saisie',
      texte: dto.texte.trim(),
      ...responsable,
      echeance: dto.echeance,
      creeParId: a.userId,
      proposition: dto.proposer ? 'proposee' : null,
    }));
    if (dto.proposer) {
      // Le CEO reçoit la proposition ; le responsable n'est prévenu qu'à l'acceptation.
      await this.notifications.envoyer({
        societeId: a.societeId,
        type: 'decision_proposee',
        titre: `Décision proposée par le ${libelleRole(a.role)} · ${numeroDecision(creee!.numero)} · ${court(dto.texte.trim())} · à accepter, modifier ou refuser`,
        destinataireIds: await avecDelegataire(this.prisma, a.societeId, arbitres, a.userId),
        parId: a.userId,
      });
    } else {
      await this.prevenirResponsable(a, { texte: dto.texte.trim(), echeance: dto.echeance, ...responsable });
    }
    return this.vue(a);
  }

  // Le responsable (fiche d'équipe ou titulaires du rôle) est prévenu.
  private async prevenirResponsable(
    a: Acteur,
    d: { texte: string; echeance: string; responsableRole: string | null; responsableCollaborateurId: string | null },
  ) {
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'decision_assignee',
      titre: `Décision à mettre en œuvre · ${court(d.texte)} · échéance ${d.echeance.slice(8, 10)}/${d.echeance.slice(5, 7)}`,
      destinataireIds: d.responsableCollaborateurId
        ? await this.notifications.comptesDe([d.responsableCollaborateurId])
        : await this.notifications.titulairesRole(a.societeId, d.responsableRole!),
      parId: a.userId,
    });
  }

  // Arbitrage par le CEO d'une décision proposée par le CTO ou le COO. Acceptée (telle
  // quelle ou modifiée), elle entre en vigueur ce jour : date de la décision =
  // jour de l'arbitrage, responsable prévenu, relances comme toute décision.
  // Refusée, elle reste au registre avec son motif. Le CTO est prévenu.
  async arbitrer(a: Acteur, id: string, dto: ArbitrerDecisionDto) {
    const delegue = !ARBITRES.has(a.role) && (await agitPourCeo(this.prisma, a));
    if (!ARBITRES.has(a.role) && !delegue)
      throw new ForbiddenException('Seul le CEO accepte, modifie ou refuse une décision proposée.');
    const d = await this.prisma.decisionRegistre.findFirst({ where: { id, societeId: a.societeId } });
    if (!d) throw new NotFoundException('Décision introuvable.');
    // Délégataire du CEO : jamais sa propre proposition.
    if (delegue && d.creeParId === a.userId)
      throw new ForbiddenException('Vous ne pouvez pas arbitrer votre propre proposition : elle attend le CEO.');
    if (d.proposition !== 'proposee') throw new ConflictException('Cette décision n’attend pas d’arbitrage.');
    const jour = todayIso();
    const numero = numeroDecision(d.numero);
    let titre: string;
    if (dto.issue === 'refuser') {
      const motif = dto.motif?.trim();
      if (!motif || motif.length < 3) throw new BadRequestException('Le motif du refus est obligatoire.');
      await this.prisma.decisionRegistre.update({
        where: { id },
        data: { proposition: 'refusee', arbitreLe: new Date(), arbitreParId: a.userId, motifArbitrage: motif },
      });
      titre = `Décision ${numero} refusée par le CEO · ${court(d.texte)} · « ${court(motif)} »`;
    } else {
      const modifiee = dto.issue === 'modifier';
      const texte = modifiee && dto.texte ? dto.texte.trim() : d.texte;
      const echeance = (modifiee && dto.echeance) || d.echeance!;
      const responsable =
        modifiee && (dto.responsableRole || dto.responsableCollaborateurId)
          ? await this.responsable(a.societeId, dto)
          : {
              responsable: d.responsable,
              responsableRole: d.responsableRole,
              responsableCollaborateurId: d.responsableCollaborateurId,
            };
      if (echeance < jour)
        throw new BadRequestException('L’échéance proposée est passée : modifiez-la avant d’accepter.');
      const change = texte !== d.texte || echeance !== d.echeance || responsable.responsable !== d.responsable;
      if (modifiee && !change)
        throw new BadRequestException('Rien n’a été modifié : acceptez la décision telle quelle.');
      await this.prisma.decisionRegistre.update({
        where: { id },
        data: {
          proposition: 'acceptee',
          arbitreLe: new Date(),
          arbitreParId: a.userId,
          motifArbitrage: modifiee ? (dto.motif?.trim() ?? null) : null,
          date: jour,
          texte,
          echeance,
          ...responsable,
          proposeeInitiale: change
            ? { texte: d.texte, responsable: d.responsable, echeance: d.echeance }
            : Prisma.DbNull,
        },
      });
      await this.prevenirResponsable(a, {
        texte,
        echeance,
        responsableRole: responsable.responsableRole,
        responsableCollaborateurId: responsable.responsableCollaborateurId,
      });
      titre = `Décision ${numero} ${change ? 'acceptée avec modifications' : 'acceptée'} par le CEO · ${court(texte)}`;
    }
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'decision_arbitree',
      titre,
      destinataireIds: [d.creeParId],
      parId: a.userId,
    });
    return this.vue(a);
  }

  private async responsable(
    societeId: string,
    dto: Pick<SaisirDecisionDto, 'responsableRole' | 'responsableCollaborateurId'>,
  ) {
    if (!!dto.responsableRole === !!dto.responsableCollaborateurId)
      throw new BadRequestException('Un responsable, rôle ou collaborateur, est requis.');
    if (dto.responsableRole) {
      if (!ROLES_RESPONSABLES.includes(dto.responsableRole)) throw new BadRequestException('Rôle responsable inconnu.');
      if (!(await this.notifications.titulairesRole(societeId, dto.responsableRole)).length) {
        throw new BadRequestException(
          `Aucun compte HUB actif ne porte le rôle ${libelleRole(dto.responsableRole)} : il ne serait jamais prévenu.`,
        );
      }
      return {
        responsable: libelleRole(dto.responsableRole),
        responsableRole: dto.responsableRole,
        responsableCollaborateurId: null,
      };
    }
    const c = await this.prisma.collaborateur.findFirst({
      where: { id: dto.responsableCollaborateurId, societeId },
      select: {
        id: true,
        prenom: true,
        nom: true,
        utilisateur: { select: { actif: true } },
        dossierPersonnel: { select: { utilisateur: { select: { actif: true } } } },
      },
    });
    if (!c) throw new BadRequestException('Collaborateur responsable introuvable.');
    // Revue CTO : un responsable sans compte HUB ne serait jamais relancé.
    if (!c.utilisateur?.actif && !c.dossierPersonnel?.utilisateur?.actif) {
      throw new BadRequestException(`${nomDe(c)} n’a pas de compte HUB actif : choisissez un responsable qui en a un.`);
    }
    return { responsable: nomDe(c), responsableRole: null, responsableCollaborateurId: c.id };
  }

  // Projets, cellules et clients proposés au rattachement d'une décision.
  private async rattachables(societeId: string) {
    const [projets, cellules, clients] = await Promise.all([
      this.prisma.projet.findMany({
        where: { societeId, ouvertLe: { not: null } },
        orderBy: { code: 'asc' },
        select: { id: true, code: true },
      }),
      this.prisma.cellule.findMany({ where: { societeId }, orderBy: { code: 'asc' }, select: { id: true, nom: true } }),
      this.prisma.client.findMany({ where: { societeId }, orderBy: { nom: 'asc' }, select: { id: true, nom: true } }),
    ]);
    return {
      projets: projets.map((p) => ({ id: p.id, libelle: p.code })),
      cellules: cellules.map((c) => ({ id: c.id, libelle: c.nom })),
      clients: clients.map((c) => ({ id: c.id, libelle: c.nom })),
    };
  }

  // Rattachement d'une décision saisie : un seul, de la société.
  private async rattachementSaisi(societeId: string, dto: SaisirDecisionDto) {
    const choisis = [dto.projetId, dto.celluleId, dto.clientId].filter(Boolean);
    if (choisis.length > 1)
      throw new BadRequestException('Une décision se rattache à un seul élément : projet, cellule ou client.');
    const existe = async (n: number) => {
      if (!n) throw new BadRequestException('Élément de rattachement introuvable dans la société.');
    };
    if (dto.projetId) await existe(await this.prisma.projet.count({ where: { id: dto.projetId, societeId } }));
    if (dto.celluleId) await existe(await this.prisma.cellule.count({ where: { id: dto.celluleId, societeId } }));
    if (dto.clientId) await existe(await this.prisma.client.count({ where: { id: dto.clientId, societeId } }));
    return { projetId: dto.projetId ?? null, celluleId: dto.celluleId ?? null, clientId: dto.clientId ?? null };
  }

  // Décisions rattachées à un projet, une cellule ou un client (fiche concernée).
  async decisionsRattachees(a: Acteur, cible: { projetId?: string; celluleId?: string; clientId?: string }) {
    if (!cible.projetId && !cible.celluleId && !cible.clientId)
      throw new BadRequestException('Projet, cellule ou client requis.');
    const jour = todayIso();
    const decisions = await this.prisma.decisionRegistre.findMany({
      where: {
        societeId: a.societeId,
        ...(cible.projetId
          ? { projetId: cible.projetId }
          : cible.celluleId
            ? { celluleId: cible.celluleId }
            : { clientId: cible.clientId }),
        // Une proposition refusée n'a jamais été une décision : pas sur la fiche.
        OR: [{ proposition: null }, { proposition: { in: ['proposee', 'acceptee'] } }],
      },
      orderBy: { numero: 'desc' },
    });
    return decisions.map((d) => ({
      id: d.id,
      numero: numeroDecision(d.numero),
      date: d.date,
      instance: d.instance,
      texte: d.texte,
      responsable: d.responsable,
      echeance: d.echeance,
      statut: statutDecision(
        { echeance: d.echeance, closeLe: d.closeLe ? toIsoDay(d.closeLe) : null, proposition: d.proposition },
        jour,
      ),
    }));
  }

  async cloturer(a: Acteur, id: string) {
    const d = await this.prisma.decisionRegistre.findFirst({ where: { id, societeId: a.societeId } });
    if (!d) throw new NotFoundException('Décision introuvable.');
    if (d.origine !== 'saisie') throw new ConflictException('Une décision inscrite par le HUB se clôt d’elle-même.');
    if (d.closeLe) throw new ConflictException('Décision déjà close.');
    if (!enVigueur(d))
      throw new ConflictException('Une décision proposée ou refusée ne se clôt pas : elle n’est pas en vigueur.');
    if (!this.peutCloturer(a, d, await this.collaborateurDuCompte(a))) {
      throw new ForbiddenException('Seuls le responsable, le CTO et le CEO clôturent une décision.');
    }
    await this.prisma.decisionRegistre.update({ where: { id }, data: { closeLe: new Date(), closeParId: a.userId } });
    return this.vue(a);
  }

  // Numéro D-NNN suivant, jamais réutilisé ; une collision (deux créations
  // simultanées) est rejouée.
  private async creerNumerotee(
    societeId: string,
    data: (numero: number) => Prisma.DecisionRegistreUncheckedCreateInput,
  ) {
    for (let essai = 0; essai < 3; essai++) {
      const max = await this.prisma.decisionRegistre.aggregate({ where: { societeId }, _max: { numero: true } });
      try {
        return await this.prisma.decisionRegistre.create({ data: data((max._max.numero ?? 0) + 1) });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        const cle = data(0).cleOrigine;
        if (
          cle &&
          (await this.prisma.decisionRegistre.findUnique({
            where: { societeId_cleOrigine: { societeId, cleOrigine: cle } },
          }))
        )
          return null;
      }
    }
    throw new ConflictException('Numérotation du registre indisponible, réessayez.');
  }

  // Inscrit (ou met à jour) les décisions que le HUB porte lui-même :
  // avenants envoyés, permissions exceptionnelles accordées, reportings non
  // déposés à l'échéance, changements de Réglages. Idempotent (cleOrigine).
  private async synchroniserRegistre(societeId: string, jour: string) {
    const sources = (
      await Promise.all([
        this.decisionsAvenants(societeId, jour),
        this.decisionsPermissions(societeId, jour),
        this.decisionsReportings(societeId, jour),
        this.decisionsReglages(societeId),
      ])
    ).flat();
    const existantes = new Map(
      (await this.prisma.decisionRegistre.findMany({ where: { societeId, origine: 'hub' } })).map(
        (d) => [d.cleOrigine!, d] as const,
      ),
    );
    const champs = (s: DecisionHub) => ({
      date: s.date,
      instance: s.instance,
      texte: s.texte,
      responsable: s.responsable,
      responsableRole: s.responsableRole,
      responsableCollaborateurId: s.responsableCollaborateurId,
      echeance: s.echeance,
      closeLe: s.closeLe,
    });
    for (const s of sources.sort((x, y) => x.date.localeCompare(y.date))) {
      const d = existantes.get(s.cle);
      if (!d) {
        await this.creerNumerotee(societeId, (numero) => ({
          societeId,
          numero,
          origine: 'hub',
          cleOrigine: s.cle,
          ...champs(s),
        }));
        continue;
      }
      const change =
        d.texte !== s.texte ||
        d.echeance !== s.echeance ||
        d.responsable !== s.responsable ||
        !!d.closeLe !== !!s.closeLe;
      if (change) await this.prisma.decisionRegistre.update({ where: { id: d.id }, data: champs(s) });
    }
  }

  // Avenant (TS) envoyé au client : responsable = pilote de la cellule du
  // projet ; échéance = délai d'alerte des Réglages ; close à la réponse.
  private async decisionsAvenants(societeId: string, jour: string): Promise<DecisionHub[]> {
    const [seuil, devis] = await Promise.all([
      this.reglages.regle<number>(societeId, 'alerte_avenant_jours'),
      this.prisma.devis.findMany({
        where: {
          societeId,
          projetId: { not: null },
          dateEnvoi: { not: null },
          lignes: { some: { produitService: { famille: 'TS' } } },
        },
        select: {
          id: true,
          statut: true,
          dateValidite: true,
          dateEnvoi: true,
          dateReponse: true,
          lignes: {
            orderBy: { ordre: 'asc' },
            where: { produitService: { famille: 'TS' } },
            select: { designation: true },
          },
          projet: {
            select: {
              code: true,
              cellules: {
                take: 1,
                select: { cellule: { select: { dispatcher: { select: { id: true, prenom: true, nom: true } } } } },
              },
            },
          },
        },
      }),
    ]);
    return devis.map((d) => {
      const envoi = toIsoDay(d.dateEnvoi!);
      const pilote = d.projet?.cellules[0]?.cellule.dispatcher ?? null;
      const ouvert = ['envoye', 'expire'].includes(statutDevisEffectif(d, jour));
      return {
        cle: `avenant:${d.id}`,
        date: envoi,
        instance: `Projets · ${d.projet?.code ?? '—'}`,
        texte: `${d.lignes.map((l) => l.designation).join(' · ')} : avenant envoyé au client`,
        responsable: pilote ? nomDe(pilote) : 'Direction GC',
        responsableRole: pilote ? null : 'Dir. GC',
        responsableCollaborateurId: pilote?.id ?? null,
        echeance: addDays(envoi, seuil),
        closeLe: ouvert ? null : (d.dateReponse ?? new Date()),
      };
    });
  }

  // Permission exceptionnelle accordée par le N+1 : close une fois l'absence passée.
  private async decisionsPermissions(societeId: string, jour: string): Promise<DecisionHub[]> {
    const demandes = await this.prisma.demandeAbsence.findMany({
      where: {
        type: 'permission_exceptionnelle',
        statut: { in: ['accord_n1', 'validee'] },
        decisionN1Le: { not: null },
        dossier: { societeId },
      },
      select: {
        id: true,
        dateDebut: true,
        dateFin: true,
        decisionN1Le: true,
        n1Role: true,
        n1CollaborateurId: true,
        dossier: { select: { prenom: true, nom: true } },
      },
    });
    const n1 = await this.prisma.collaborateur.findMany({
      where: { id: { in: demandes.flatMap((d) => (d.n1CollaborateurId ? [d.n1CollaborateurId] : [])) } },
      select: { id: true, prenom: true, nom: true },
    });
    return demandes.map((d) => {
      const c = n1.find((x) => x.id === d.n1CollaborateurId);
      return {
        cle: `permission:${d.id}`,
        date: toIsoDay(d.decisionN1Le!),
        instance: 'RH · congés',
        texte: `Accord · Permission exceptionnelle de ${nomDe(d.dossier)} (${formatDate(d.dateDebut)} → ${formatDate(d.dateFin)})`,
        responsable: c ? nomDe(c) : libelleRole(d.n1Role ?? 'Dir. GC'),
        responsableRole: c ? null : (d.n1Role ?? 'Dir. GC'),
        responsableCollaborateurId: c?.id ?? null,
        echeance: null,
        closeLe: d.dateFin < jour ? new Date(`${d.dateFin}T23:59:59Z`) : null,
      };
    });
  }

  // Reporting non déposé à l'échéance : alerte au registre pour le CODIR,
  // close au dépôt.
  private async decisionsReportings(societeId: string, jour: string): Promise<DecisionHub[]> {
    const [societe, deposes] = await Promise.all([
      this.prisma.societe.findUniqueOrThrow({ where: { id: societeId }, select: { nom: true } }),
      this.prisma.reportingMensuel.findMany({
        where: { societeId },
        select: { type: true, mois: true, deposeLe: true },
      }),
    ]);
    const types: TypeReporting[] = ['direction', 'rh'];
    return moisAReporter(jour).flatMap((mois) =>
      types.flatMap((type) => {
        const echeance = echeanceReporting(mois);
        const depot = deposes.find((d) => d.type === type && d.mois === mois);
        if (depot ? toIsoDay(depot.deposeLe) <= echeance : jour <= echeance) return [];
        const { emetteur } = REPORTINGS[type];
        const titre = type === 'direction' ? `Reporting ${societe.nom}` : 'Reporting RH';
        return [
          {
            cle: `reporting:${type}:${mois}`,
            date: addDays(echeance, 1),
            instance: 'CODIR · reportings',
            texte: `Alerte : ${titre} de ${mois.split('-').reverse().join('/')} non déposé au ${formatDate(echeance)}`,
            responsable: libelleRole(emetteur),
            responsableRole: emetteur,
            responsableCollaborateurId: null,
            echeance: null,
            closeLe: depot?.deposeLe ?? null,
          },
        ];
      }),
    );
  }

  // Changement de Réglages (motif obligatoire, journal) : décision prise et
  // appliquée, inscrite close.
  private async decisionsReglages(societeId: string): Promise<DecisionHub[]> {
    const journal = await this.prisma.journalReglage.findMany({
      where: { societeId },
      select: { id: true, libelle: true, motif: true, createdAt: true },
    });
    return journal.map((j) => ({
      cle: `reglage:${j.id}`,
      date: toIsoDay(j.createdAt),
      instance: 'Réglages',
      texte: `${j.libelle} · motif : ${j.motif}`,
      responsable: 'CIO',
      responsableRole: 'CIO (transverse)',
      responsableCollaborateurId: null,
      echeance: null,
      closeLe: j.createdAt,
    }));
  }
}

// Ni proposée en attente, ni refusée.
const enVigueur = (d: { proposition: string | null }) => d.proposition === null || d.proposition === 'acceptee';
const court = (texte: string, n = 80) => (texte.length > n ? `${texte.slice(0, n - 1)}…` : texte);

// Libellé du rattachement d'une décision (« Projet FS_POI.26 »…), null sans.
function rattachementDe(d: {
  projet: { code: string } | null;
  cellule: { nom: string } | null;
  client: { nom: string } | null;
}) {
  if (d.projet) return { type: 'projet' as const, libelle: d.projet.code };
  if (d.cellule) return { type: 'cellule' as const, libelle: d.cellule.nom };
  if (d.client) return { type: 'client' as const, libelle: d.client.nom };
  return null;
}
