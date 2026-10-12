import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type NiveauPermission, type TypeReporting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { TempsService } from '../rh/temps.service';
import { bornesMois, feuilleDuMois, moisDe, moisEntre, MOIS_DEBUT_FEUILLES, type Salarie } from '../rh/regles-temps';
import { partATemps } from '../equipe/equipes-regles';
import { ajouterJours, statutDevisEffectif } from '../devis/domaine';
import { etatCarte, etatTache, indexTaches, resumeEtape, type CarteSource, type EtatTache, type TacheSource } from '../projets/gabarit/etats';
import {
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
import type { SaisirDecisionDto } from './dto';

export type Acteur = { userId: string; societeId: string; role: string; permissions?: Record<string, NiveauPermission> };

// Rôles qui saisissent et clôturent les décisions des instances (choix du
// 05/10/2026 : « par fonction », la matrice reste en lecture).
const ROLES_REGISTRE = new Set(['CTO (transverse)', 'CEO (transverse)', 'societe_admin']);

// Rôles proposés comme responsables d'une décision (fonctions de direction).
const ROLES_RESPONSABLES = ['Dir. GC', 'COO', 'CFO', 'CEO (transverse)', 'CTO (transverse)', 'CIO (transverse)', 'RH'];

// « CTO (transverse) » → « CTO », « Dir. GC » → « Direction GC » (maquette).
export const libelleRole = (role: string) => (role === 'Dir. GC' ? 'Direction GC' : role.replace(/\s*\(transverse\)$/, ''));

const jourIso = (d: Date) => d.toISOString().slice(0, 10);
const aujourdhui = () => jourIso(new Date());
const nomDe = (c: { prenom: string; nom: string }) => `${c.prenom} ${c.nom}`;
const dateFr = (iso: string) => iso.split('-').reverse().join('/');
const SU = ['SU1', 'SU2', 'SU3'];
// « 2026-09 » → « septembre 2026 ».
export const moisLong = (mois: string) =>
  new Date(`${mois}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

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
  ) {}

  async vue(a: Acteur) {
    const jour = aujourdhui();
    await this.synchroniserRegistre(a.societeId, jour);
    const feuilles = await this.feuillesControlees(a.societeId, jour);
    const [indicateurs, reportings, registre, chiffres] = await Promise.all([
      this.indicateurs(a.societeId, jour, feuilles),
      this.reportings(a, jour),
      this.registre(a, jour),
      this.chiffres.tuiles(a, jour, feuilles),
    ]);
    const suivis = indicateurs.filter((i) => i.evaluation !== 'sans_donnee');
    return {
      mois: moisLong(moisDe(jour)),
      tuiles: {
        horsObjectif: indicateurs.filter((i) => i.evaluation === 'hors_objectif').length,
        suivis: suivis.length,
        reportingsADeposer: reportings.filter((r) => r.statut === 'a_deposer' || r.statut === 'en_retard').length,
        decisionsOuvertes: registre.decisions.filter((d) => d.statut !== 'close').length,
      },
      // Chiffres clés en tête de page, selon la matrice (chiffres.service.ts).
      chiffres,
      indicateurs,
      reportings,
      ...registre,
    };
  }

  // --- Indicateurs -----------------------------------------------------------

  private async indicateurs(societeId: string, jour: string, feuilles: { total: number; controlees: number }) {
    const mois = moisDe(jour);
    const { debut, fin } = bornesMois(mois);
    const [objNouveaux, objConversion, objATemps, objCharge, objReprises, nouveaux, offres, taches, charge, reportings, decisions] =
      await Promise.all([
        this.reglages.regle<number | null>(societeId, 'objectif_nouveaux_projets'),
        this.reglages.regle<number | null>(societeId, 'objectif_conversion_chantier'),
        this.reglages.regle<number | null>(societeId, 'objectif_taches_a_temps'),
        this.reglages.regle<{ de: number; a: number } | null>(societeId, 'objectif_charge_equipes'),
        this.reglages.regle<number | null>(societeId, 'objectif_taux_reprises'),
        this.prisma.dossierCrm.count({
          where: { societeId, categorie: 'conception', createdAt: { gte: new Date(`${debut}T00:00:00Z`), lte: new Date(`${fin}T23:59:59.999Z`) } },
        }),
        this.conversion(societeId),
        this.prisma.tacheProjet.findMany({
          where: { projet: { societeId } },
          select: { statut: true, finLe: true, debutLe: true, heures: true, valideeLe: true, evenements: { where: { type: 'reprise' }, select: { id: true }, take: 1 } },
        }),
        this.chargeEquipes(societeId, mois, jour),
        this.prisma.reportingMensuel.findMany({ where: { societeId }, select: { mois: true, deposeLe: true } }),
        this.prisma.decisionRegistre.findMany({ where: { societeId, closeLe: null }, select: { echeance: true, closeLe: true } }),
      ]);

    const { signees, avecSuivi } = offres;
    const validees = taches.filter((t) => t.statut === 'validee');
    const aTemps = partATemps(
      taches.map((t) => ({ debut: t.debutLe, echeance: t.finLe, heures: t.heures == null ? null : Number(t.heures), statut: t.statut, valideeLe: t.valideeLe ? jourIso(t.valideeLe) : null })),
    );
    const deposes = reportings.map((r) => ({ ...r, aLHeure: jourIso(r.deposeLe) <= echeanceReporting(r.mois) }));
    const depassees = decisions.filter((d) => statutDecision({ echeance: d.echeance, closeLe: null }, jour) === 'echeance_depassee').length;

    const indicateur = (
      cle: string,
      titre: string,
      valeur: number | null,
      affichage: string,
      objectif: Objectif,
      texteObjectif: string,
      source: string,
    ) => ({ cle, titre, valeur, affichage, ...evaluer(valeur, objectif), texteObjectif, source });

    const pct = (v: number | null) => (v == null ? '—' : `${v} %`);
    const conversion = pourcentage(avecSuivi, signees);
    const reprises = pourcentage(validees.filter((t) => t.evenements.length > 0).length, validees.length);
    const ponctualite = pourcentage(deposes.filter((r) => r.aLHeure).length, deposes.length);
    const controle = pourcentage(feuilles.controlees, feuilles.total);

    return [
      indicateur(
        'nouveaux_projets',
        `Nouveaux projets de conception · ${moisLong(mois)}`,
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
        objReprises == null ? 'Indicateur qualité (manuel §2.1) · seuil à fixer dans Réglages' : `Seuil maximum : ${objReprises} % (manuel §2.1)`,
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
        `Charge des équipes · ${moisLong(mois)}`,
        charge,
        pct(charge),
        { type: 'zone', de: objCharge?.de ?? null, a: objCharge?.a ?? null, propose: { de: 70, a: 100 } },
        objCharge == null ? 'Zone proposée : 70 à 100 % · à fixer dans Réglages' : `Zone : ${objCharge.de} à ${objCharge.a} %`,
        'Durées standard des tâches assignées, réparties sur leur fenêtre',
      ),
      indicateur(
        'reportings_j5',
        'Reportings déposés à J+5',
        ponctualite,
        pct(ponctualite),
        { type: 'minimum', valeur: 100 },
        'Objectif : 100 % (manuel §4.3)',
        deposes.length ? `${deposes.filter((r) => r.aLHeure).length} à l'heure sur ${deposes.length} déposé(s)` : 'Aucun reporting déposé',
      ),
      indicateur(
        'feuilles_controlees',
        'Feuilles de temps contrôlées',
        controle,
        pct(controle),
        { type: 'minimum', valeur: 100 },
        'Objectif : 100 % des mois clos',
        feuilles.total ? `${feuilles.controlees} / ${feuilles.total} feuilles des mois clos` : 'Aucune feuille à contrôler',
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
    return { signees: offres.length, avecSuivi: offres.filter((o) => o.lignes.some((l) => SU.includes(l.produitService?.code ?? ''))).length };
  }

  // Charge du mois : heures standard des tâches assignées (gabarit), réparties
  // sur leur fenêtre, rapportées aux heures disponibles des membres des
  // cellules (calcul RH, jusqu'à aujourd'hui pour le mois en cours).
  private async chargeEquipes(societeId: string, mois: string, jour: string): Promise<number | null> {
    const [membres, feries] = await Promise.all([
      this.prisma.collaborateur.findMany({
        where: { societeId, celluleId: { not: null } },
        select: {
          tachesProjet: { where: { statut: { not: 'non_necessaire' } }, select: { id: true, debutLe: true, finLe: true, heures: true } },
          dossierPersonnel: {
            select: { dateEntree: true, archiveLe: true, absences: { where: { statut: 'validee' }, select: { dateDebut: true, dateFin: true } } },
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
        dateSortie: d?.archiveLe ? jourIso(d.archiveLe) : null,
        absences: (d?.absences ?? []).map((x) => ({ debut: x.dateDebut, fin: x.dateFin })),
      };
      const taches = m.tachesProjet.map((t) => ({ id: t.id, debut: t.debutLe, echeance: t.finLe, heures: t.heures == null ? null : Number(t.heures) }));
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
    const feuilles = parMois.flatMap((p) => p.feuilles).filter((f) => f.statut === 'a_controler' || f.statut === 'controlee');
    return { total: feuilles.length, controlees: feuilles.filter((f) => f.statut === 'controlee').length };
  }

  // --- Étapes des projets ouverts (contenu du reporting) ------------------

  private async etapesProjets(societeId: string, jour: string) {
    const [projets, feries] = await Promise.all([
      this.prisma.projet.findMany({
        where: { societeId, ouvertLe: { not: null } },
        orderBy: { ouvertLe: 'asc' },
        select: {
          code: true,
          cartes: {
            orderBy: { ordre: 'asc' },
            select: {
              cle: true,
              etapeNumero: true,
              etapeCle: true,
              etapeLibelle: true,
              fichiers: true,
              desactivation: true,
              ouvreApres: true,
              taches: {
                orderBy: { ordre: 'asc' },
                select: { cle: true, libelle: true, statut: true, debutLe: true, finLe: true, version: true, valideeLe: true },
              },
            },
          },
        },
      }),
      this.reglages.joursFeries([societeId]),
    ]);
    const ferieSet = feries.get(societeId) ?? new Set<string>();
    return projets.map((p) => {
      const sources: CarteSource[] = p.cartes.map((c) => ({
        ...c,
        taches: c.taches.map((t): TacheSource => ({ ...t, valideeLe: t.valideeLe ? jourIso(t.valideeLe) : null })),
      }));
      const index = indexTaches(sources);
      const parEtape = new Map<number, { libelle: string; etats: { tache: TacheSource; etat: EtatTache }[] }>();
      sources.forEach((c, i) => {
        const carte = etatCarte(c, index);
        const e = parEtape.get(c.etapeNumero) ?? { libelle: p.cartes[i].etapeLibelle, etats: [] };
        c.taches.forEach((t) => e.etats.push({ tache: t, etat: etatTache(t, carte, jour, ferieSet) }));
        parEtape.set(c.etapeNumero, e);
      });
      const etapes = [...parEtape.entries()]
        .sort(([x], [y]) => x - y)
        .map(([n, e]) => {
          const resume = resumeEtape(n, e.etats);
          const dates = e.etats.map((x) => x.tache.valideeLe).filter((d): d is string => !!d).sort();
          return { ...resume, libelle: e.libelle, closeLe: resume.etat === 'terminee' ? (dates.at(-1) ?? null) : null };
        });
      return { code: p.code, etapes };
    });
  }

  // Reporting {société} prérempli depuis le HUB pour un mois clos.
  private async contenuDirection(societeId: string, mois: string, jour: string) {
    const { debut, fin } = bornesMois(mois);
    const [projets, remises, conversion, objectifConversion, charge] = await Promise.all([
      this.etapesProjets(societeId, jour),
      this.prisma.evenementTacheProjet.count({
        where: { type: 'remise', tache: { projet: { societeId } }, creeLe: { gte: new Date(`${debut}T00:00:00Z`), lte: new Date(`${fin}T23:59:59.999Z`) } },
      }),
      this.conversion(societeId),
      this.reglages.regle<number | null>(societeId, 'objectif_conversion_chantier'),
      this.chargeEquipes(societeId, mois, jour),
    ]);
    const enCours = projets.filter((p) => p.etapes.some((e) => e.etat !== 'terminee'));
    const closes = projets.flatMap((p) => p.etapes.filter((e) => e.closeLe && moisDe(e.closeLe) === mois).map((e) => `${p.code} · ${e.libelle}`));
    const enRetard = projets.reduce((n, p) => n + p.etapes.filter((e) => e.etat === 'en_retard').length, 0);
    const tauxConversion = pourcentage(conversion.avecSuivi, conversion.signees);
    return [
      { libelle: 'Projets en cours', valeur: enCours.length ? `${enCours.length} · ${enCours.map((p) => p.code).join(', ')}` : '0' },
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

  private async reportings(a: Acteur, jour: string) {
    const [societe, deposes] = await Promise.all([
      this.prisma.societe.findUniqueOrThrow({ where: { id: a.societeId }, select: { nom: true } }),
      this.prisma.reportingMensuel.findMany({ where: { societeId: a.societeId } }),
    ]);
    const types: TypeReporting[] = ['direction', 'rh'];
    // Le plus récent en premier ; le reporting de la société avant le RH.
    const lignes = [...moisAReporter(jour)].reverse().flatMap((mois) =>
      types.map((type) => ({ mois, type, depot: deposes.find((d) => d.type === type && d.mois === mois) ?? null })),
    );
    return Promise.all(
      lignes.map(async ({ mois, type, depot }) => {
        const deposeLe = depot ? jourIso(depot.deposeLe) : null;
        const statut = statutReporting(mois, deposeLe, jour);
        const { emetteur, destinataire } = REPORTINGS[type];
        // Prérempli tant qu'il n'est pas déposé ; figé ensuite. Le reporting
        // RH n'a pas encore de contenu défini (aucune rubrique fournie).
        const contenu = depot
          ? ((depot.contenu as { libelle: string; valeur: string }[] | null) ?? null)
          : type === 'direction'
            ? await this.contenuDirection(a.societeId, mois, jour)
            : null;
        return {
          type,
          mois,
          periode: moisLong(mois),
          titre: type === 'direction' ? `Reporting ${societe.nom}` : 'Reporting RH',
          emetteur: libelleRole(emetteur),
          destinataire: libelleRole(destinataire),
          echeance: echeanceReporting(mois),
          statut,
          deposeLe,
          contenu,
          peutDeposer: !depot && a.role === emetteur,
        };
      }),
    );
  }

  async deposer(a: Acteur, type: TypeReporting, mois: string) {
    const jour = aujourdhui();
    if (!REPORTINGS[type]) throw new NotFoundException('Reporting inconnu.');
    if (a.role !== REPORTINGS[type].emetteur) {
      throw new ForbiddenException(`Seul l’émetteur (${libelleRole(REPORTINGS[type].emetteur)}) dépose ce reporting.`);
    }
    if (!moisAReporter(jour).includes(mois)) throw new BadRequestException('Seul le reporting d’un mois clos se dépose.');
    const contenu = type === 'direction' ? await this.contenuDirection(a.societeId, mois, jour) : undefined;
    try {
      await this.prisma.reportingMensuel.create({
        data: { societeId: a.societeId, type, mois, deposeParId: a.userId, contenu: contenu ?? Prisma.JsonNull },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Reporting déjà déposé.');
      throw e;
    }
    return this.vue(a);
  }

  // --- Registre des décisions ---------------------------------------------

  private async registre(a: Acteur, jour: string) {
    const [decisions, collaborateurId, roles, collaborateurs] = await Promise.all([
      this.prisma.decisionRegistre.findMany({ where: { societeId: a.societeId }, orderBy: { numero: 'desc' } }),
      this.collaborateurDuCompte(a),
      this.prisma.role.findMany({ where: { nom: { in: ROLES_RESPONSABLES } }, select: { nom: true } }),
      this.prisma.collaborateur.findMany({ where: { societeId: a.societeId }, orderBy: [{ nom: 'asc' }, { prenom: 'asc' }], select: { id: true, prenom: true, nom: true } }),
    ]);
    const saisir = ROLES_REGISTRE.has(a.role);
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
        statut: statutDecision({ echeance: d.echeance, closeLe: d.closeLe ? jourIso(d.closeLe) : null }, jour),
        closeLe: d.closeLe ? jourIso(d.closeLe) : null,
        peutCloturer: d.origine === 'saisie' && !d.closeLe && this.peutCloturer(a, d, collaborateurId),
      })),
      saisie: saisir
        ? {
            instances: [...INSTANCES_SAISIE],
            responsables: [
              ...ROLES_RESPONSABLES.filter((r) => roles.some((x) => x.nom === r)).map((r) => ({ role: r, libelle: libelleRole(r) })),
              ...collaborateurs.map((c) => ({ collaborateurId: c.id, libelle: nomDe(c) })),
            ],
          }
        : null,
    };
  }

  private peutCloturer(a: Acteur, d: { responsableRole: string | null; responsableCollaborateurId: string | null }, collaborateurId: string | null) {
    if (ROLES_REGISTRE.has(a.role)) return true;
    if (d.responsableRole && d.responsableRole === a.role) return true;
    return !!collaborateurId && d.responsableCollaborateurId === collaborateurId;
  }

  // Fiche d'équipe du compte connecté (directe, ou via son dossier RH).
  private async collaborateurDuCompte(a: Acteur): Promise<string | null> {
    const c = await this.prisma.collaborateur.findFirst({
      where: { societeId: a.societeId, OR: [{ utilisateurId: a.userId }, { dossierPersonnel: { utilisateurId: a.userId } }] },
      select: { id: true },
    });
    return c?.id ?? null;
  }

  async saisir(a: Acteur, dto: SaisirDecisionDto) {
    if (!ROLES_REGISTRE.has(a.role)) throw new ForbiddenException('Saisir une décision est réservé au CTO et au CEO.');
    const jour = aujourdhui();
    const date = dto.date ?? jour;
    if (date > jour) throw new BadRequestException('Une décision ne peut pas être datée dans le futur.');
    if (dto.echeance < date) throw new BadRequestException('L’échéance précède la date de la décision.');
    const responsable = await this.responsable(a.societeId, dto);
    await this.creerNumerotee(a.societeId, (numero) => ({
      societeId: a.societeId,
      numero,
      date,
      instance: dto.instance,
      origine: 'saisie',
      texte: dto.texte.trim(),
      ...responsable,
      echeance: dto.echeance,
      creeParId: a.userId,
    }));
    return this.vue(a);
  }

  private async responsable(societeId: string, dto: SaisirDecisionDto) {
    if (!!dto.responsableRole === !!dto.responsableCollaborateurId) throw new BadRequestException('Un responsable, rôle ou collaborateur, est requis.');
    if (dto.responsableRole) {
      if (!ROLES_RESPONSABLES.includes(dto.responsableRole)) throw new BadRequestException('Rôle responsable inconnu.');
      return { responsable: libelleRole(dto.responsableRole), responsableRole: dto.responsableRole, responsableCollaborateurId: null };
    }
    const c = await this.prisma.collaborateur.findFirst({ where: { id: dto.responsableCollaborateurId, societeId }, select: { id: true, prenom: true, nom: true } });
    if (!c) throw new BadRequestException('Collaborateur responsable introuvable.');
    return { responsable: nomDe(c), responsableRole: null, responsableCollaborateurId: c.id };
  }

  async cloturer(a: Acteur, id: string) {
    const d = await this.prisma.decisionRegistre.findFirst({ where: { id, societeId: a.societeId } });
    if (!d) throw new NotFoundException('Décision introuvable.');
    if (d.origine !== 'saisie') throw new ConflictException('Une décision inscrite par le HUB se clôt d’elle-même.');
    if (d.closeLe) throw new ConflictException('Décision déjà close.');
    if (!this.peutCloturer(a, d, await this.collaborateurDuCompte(a))) {
      throw new ForbiddenException('Seuls le responsable, le CTO et le CEO clôturent une décision.');
    }
    await this.prisma.decisionRegistre.update({ where: { id }, data: { closeLe: new Date(), closeParId: a.userId } });
    return this.vue(a);
  }

  // Numéro D-NNN suivant, jamais réutilisé ; une collision (deux créations
  // simultanées) est rejouée.
  private async creerNumerotee(societeId: string, data: (numero: number) => Prisma.DecisionRegistreUncheckedCreateInput) {
    for (let essai = 0; essai < 3; essai++) {
      const max = await this.prisma.decisionRegistre.aggregate({ where: { societeId }, _max: { numero: true } });
      try {
        return await this.prisma.decisionRegistre.create({ data: data((max._max.numero ?? 0) + 1) });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        const cle = data(0).cleOrigine;
        if (cle && (await this.prisma.decisionRegistre.findUnique({ where: { societeId_cleOrigine: { societeId, cleOrigine: cle } } }))) return null;
      }
    }
    throw new ConflictException('Numérotation du registre indisponible, réessayez.');
  }

  // Inscrit (ou met à jour) les décisions que le HUB porte lui-même :
  // avenants envoyés, permissions exceptionnelles accordées, reportings non
  // déposés à l'échéance, changements de Réglages. Idempotent (cleOrigine).
  private async synchroniserRegistre(societeId: string, jour: string) {
    const sources = (await Promise.all([this.decisionsAvenants(societeId, jour), this.decisionsPermissions(societeId, jour), this.decisionsReportings(societeId, jour), this.decisionsReglages(societeId)])).flat();
    const existantes = new Map(
      (await this.prisma.decisionRegistre.findMany({ where: { societeId, origine: 'hub' } })).map((d) => [d.cleOrigine!, d] as const),
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
        await this.creerNumerotee(societeId, (numero) => ({ societeId, numero, origine: 'hub', cleOrigine: s.cle, ...champs(s) }));
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
        where: { societeId, projetId: { not: null }, dateEnvoi: { not: null }, lignes: { some: { produitService: { famille: 'TS' } } } },
        select: {
          id: true,
          statut: true,
          dateValidite: true,
          dateEnvoi: true,
          dateReponse: true,
          lignes: { orderBy: { ordre: 'asc' }, where: { produitService: { famille: 'TS' } }, select: { designation: true } },
          projet: { select: { code: true, cellules: { take: 1, select: { cellule: { select: { dispatcher: { select: { id: true, prenom: true, nom: true } } } } } } } },
        },
      }),
    ]);
    return devis.map((d) => {
      const envoi = jourIso(d.dateEnvoi!);
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
        echeance: ajouterJours(envoi, seuil),
        closeLe: ouvert ? null : (d.dateReponse ?? new Date()),
      };
    });
  }

  // Permission exceptionnelle accordée par le N+1 : close une fois l'absence passée.
  private async decisionsPermissions(societeId: string, jour: string): Promise<DecisionHub[]> {
    const demandes = await this.prisma.demandeAbsence.findMany({
      where: { type: 'permission_exceptionnelle', statut: { in: ['accord_n1', 'validee'] }, decisionN1Le: { not: null }, dossier: { societeId } },
      select: { id: true, dateDebut: true, dateFin: true, decisionN1Le: true, n1Role: true, n1CollaborateurId: true, dossier: { select: { prenom: true, nom: true } } },
    });
    const n1 = await this.prisma.collaborateur.findMany({
      where: { id: { in: demandes.flatMap((d) => (d.n1CollaborateurId ? [d.n1CollaborateurId] : [])) } },
      select: { id: true, prenom: true, nom: true },
    });
    return demandes.map((d) => {
      const c = n1.find((x) => x.id === d.n1CollaborateurId);
      return {
        cle: `permission:${d.id}`,
        date: jourIso(d.decisionN1Le!),
        instance: 'RH · congés',
        texte: `Accord · Permission exceptionnelle de ${nomDe(d.dossier)} (${dateFr(d.dateDebut)} → ${dateFr(d.dateFin)})`,
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
      this.prisma.reportingMensuel.findMany({ where: { societeId }, select: { type: true, mois: true, deposeLe: true } }),
    ]);
    const types: TypeReporting[] = ['direction', 'rh'];
    return moisAReporter(jour).flatMap((mois) =>
      types.flatMap((type) => {
        const echeance = echeanceReporting(mois);
        const depot = deposes.find((d) => d.type === type && d.mois === mois);
        if (depot ? jourIso(depot.deposeLe) <= echeance : jour <= echeance) return [];
        const { emetteur } = REPORTINGS[type];
        const titre = type === 'direction' ? `Reporting ${societe.nom}` : 'Reporting RH';
        return [
          {
            cle: `reporting:${type}:${mois}`,
            date: ajouterJours(echeance, 1),
            instance: 'CODIR · reportings',
            texte: `Alerte : ${titre} de ${mois.split('-').reverse().join('/')} non déposé au ${dateFr(echeance)}`,
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
    const journal = await this.prisma.journalReglage.findMany({ where: { societeId }, select: { id: true, libelle: true, motif: true, createdAt: true } });
    return journal.map((j) => ({
      cle: `reglage:${j.id}`,
      date: jourIso(j.createdAt),
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
