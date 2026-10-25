import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SectionTache } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import {
  bornesMois,
  calendrierDuMois,
  controleOuvertLe,
  type JourCalendrier,
  feuilleDuMois,
  type Manque,
  MOIS_DEBUT_FEUILLES,
  moisDe,
  moisEntre,
  periodeComptee,
  type Feries,
  type Salarie,
} from './regles-temps';
import { ouDossierDuCompte } from './mon-compte';
import { chargerTachesAssignees, type TacheAssignee } from './taches-assignees';

type Acteur = { userId: string; societeId: string };

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// `cloture` : mois clos, contrôle pas encore ouvert (avant le 3 du mois suivant).
export type StatutFeuille = 'en_cours' | 'cloture' | 'a_controler' | 'sans_heures' | 'controlee';

// Ligne de calcul d'une feuille (aussi figée telle quelle au contrôle).
export type LigneCalcul = {
  id: string;
  // Étape du gabarit (« 02 · Avant-projet ») ; les feuilles figées avant le
  // passage au gabarit (oct. 2026) portent la section du bloc à la place.
  etape?: string;
  section?: SectionTache;
  libelle: string;
  projetCode: string;
  projetProgramme: string;
  debut: string;
  echeance: string;
  dureeStandard: number | null;
  // Jours ouvrés de présence comptés dans le mois ; absent des feuilles
  // figées avant son ajout (01/10/2026).
  jours?: number;
  heures: number;
  manque: Manque | null;
};

type DetailFige = { lignes: LigneCalcul[] };

export type FeuilleCalculee = {
  mois: string;
  statut: StatutFeuille;
  heuresImputees: number;
  heuresDisponibles: number;
  joursAbsence: number;
  occupation: number | null;
  controleLe: Date | null;
  lignes: LigneCalcul[];
  // Jour par jour (calcul en direct) ; null pour une feuille figée au contrôle.
  calendrier: JourCalendrier[] | null;
};

const INCLUDE_DOSSIER = {
  societe: { select: { nom: true } },
  collaborateur: { select: { id: true, cellule: { select: { nom: true } } } },
  absences: { where: { statut: 'validee' }, select: { dateDebut: true, dateFin: true } },
  controlesTemps: true,
  ecartsTemps: { orderBy: { signaleLe: 'desc' } },
} satisfies Prisma.DossierPersonnelInclude;
type DossierTemps = Prisma.DossierPersonnelGetPayload<{ include: typeof INCLUDE_DOSSIER }>;
type Controle = DossierTemps['controlesTemps'][number];

const ROLE_RH = 'RH';

export type EcartFeuille = {
  id: string;
  commentaire: string;
  signaleLe: Date;
  reponse: string | null;
  traiteLe: Date | null;
};

// Écart du mois affiché : l'ouvert s'il y en a un, sinon le dernier traité.
function ecartDuMois(ecarts: DossierTemps['ecartsTemps'], mois: string): EcartFeuille | null {
  const duMois = ecarts.filter((e) => e.mois === mois);
  const e = duMois.find((x) => !x.traiteLe) ?? duMois[0];
  return e
    ? { id: e.id, commentaire: e.commentaire, signaleLe: e.signaleLe, reponse: e.reponse, traiteLe: e.traiteLe }
    : null;
}

const libelleMois = (mois: string) =>
  new Date(`${mois}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
// « de septembre 2026 », « d’octobre 2026 » (élision devant avril, août, octobre).
const deMois = (mois: string) => {
  const l = libelleMois(mois);
  return /^[aeiou]/i.test(l) ? `d’${l}` : `de ${l}`;
};

const salarieDe = (d: DossierTemps): Salarie => ({
  dateEntree: d.dateEntree,
  dateSortie: d.archiveLe ? d.archiveLe.toISOString().slice(0, 10) : null,
  absences: d.absences.map((a) => ({ debut: a.dateDebut, fin: a.dateFin })),
});

const planifiee = (t: TacheAssignee) => !!t.debut && !!t.echeance;

// RH · Temps de travail (lot 4) : feuilles mensuelles calculées depuis les
// tâches assignées (regles-temps.ts), contrôle RH des mois clos, « Mon temps »
// du salarié, référentiel des durées standard par société.
@Injectable()
export class TempsService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private notifications: NotificationsService,
  ) {}

  // --- Feuilles de temps (RH, périmètre groupe) ----------------------------

  // Périmètre groupe (page RH) ; `societeId` le restreint à une société
  // (Pilotage · feuilles de temps contrôlées).
  async feuilles(mois?: string, societeId?: string) {
    const jour = aujourdhui();
    const cible = moisValide(mois ?? dernierMoisClos(jour), jour);
    const dossiers = await this.prisma.dossierPersonnel.findMany({
      where: {
        ...(societeId ? { societeId } : {}),
        OR: [{ archiveLe: null }, { archiveLe: { gte: new Date(`${MOIS_DEBUT_FEUILLES}-01T00:00:00Z`) } }],
      },
      include: INCLUDE_DOSSIER,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    const taches = await chargerTachesAssignees(
      this.prisma,
      dossiers.flatMap((d) => (d.collaborateur ? [d.collaborateur.id] : [])),
    );
    const tachesDe = (d: DossierTemps) => taches.filter((t) => t.collaborateurId === d.collaborateur?.id);
    // Jours fériés de la société de chaque salarié (Réglages).
    const feries = await this.reglages.joursFeries(dossiers.map((d) => d.societeId));
    const feriesDe = (d: DossierTemps) => feries.get(d.societeId)!;
    const presentsEn = (m: string) => dossiers.filter((d) => periodeComptee(m, salarieDe(d), jour));

    const periodes = moisEntre(MOIS_DEBUT_FEUILLES, moisDe(jour)).map((m) => ({
      mois: m,
      clos: m < moisDe(jour),
      // Écarts signalés par les salariés, en attente de réponse.
      ecarts: dossiers.filter((d) => d.ecartsTemps.some((e) => e.mois === m && !e.traiteLe)).length,
      aControler: presentsEn(m).filter(
        (d) => calculer(m, salarieDe(d), d.controlesTemps, tachesDe(d), jour, feriesDe(d)).statut === 'a_controler',
      ).length,
    }));

    return {
      mois: cible,
      periodes,
      feuilles: presentsEn(cible).map((d) => ({
        dossierId: d.id,
        matricule: d.matricule,
        prenom: d.prenom,
        nom: d.nom,
        poste: d.poste,
        societe: d.societe.nom,
        cellule: d.collaborateur?.cellule?.nom ?? null,
        // État actuel (pas celui du mois) : blocs assignés sans début ou sans
        // échéance, qui ne produisent aucune heure tant qu'ils ne sont pas planifiés.
        blocsNonPlanifies: tachesDe(d).filter((t) => !planifiee(t)).length,
        ecart: ecartDuMois(d.ecartsTemps, cible),
        ...calculer(cible, salarieDe(d), d.controlesTemps, tachesDe(d), jour, feriesDe(d)),
      })),
    };
  }

  // Fige la feuille d'un mois clos telle que calculée à cet instant.
  async controler(userId: string, dossierId: string, mois: string) {
    const jour = aujourdhui();
    moisValide(mois, jour);
    if (mois >= moisDe(jour)) throw new ConflictException('Seul un mois clos peut être contrôlé.');
    const ouverture = controleOuvertLe(mois);
    if (jour < ouverture)
      throw new ConflictException(`Contrôle possible à partir du ${ouverture.split('-').reverse().join('/')}.`);
    const d = await this.prisma.dossierPersonnel.findUnique({ where: { id: dossierId }, include: INCLUDE_DOSSIER });
    if (!d) throw new NotFoundException('Dossier introuvable');
    if (!periodeComptee(mois, salarieDe(d), jour))
      throw new ConflictException("Ce salarié n'était pas présent ce mois-là.");
    if (d.controlesTemps.some((c) => c.mois === mois)) throw new ConflictException('Feuille déjà contrôlée.');
    if (d.ecartsTemps.some((e) => e.mois === mois && !e.traiteLe)) {
      throw new ConflictException(
        'Un écart signalé par le salarié attend votre réponse : traitez-le avant de contrôler.',
      );
    }

    const taches = d.collaborateur ? await chargerTachesAssignees(this.prisma, [d.collaborateur.id]) : [];
    const feries = (await this.reglages.joursFeries([d.societeId])).get(d.societeId)!;
    const f = calculer(mois, salarieDe(d), [], taches, jour, feries);
    const detail: DetailFige = { lignes: f.lignes };
    try {
      await this.prisma.controleFeuilleTemps.create({
        data: {
          dossierId,
          mois,
          heuresImputees: f.heuresImputees,
          heuresDisponibles: f.heuresDisponibles,
          joursAbsence: f.joursAbsence,
          detail: detail as unknown as Prisma.InputJsonValue,
          controleParId: userId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Feuille déjà contrôlée.');
      }
      throw e;
    }
    return { dossierId, mois };
  }

  // --- Mon temps (le salarié) ----------------------------------------------

  async monTemps(a: Acteur, mois?: string) {
    const jour = aujourdhui();
    const cible = moisValide(mois ?? moisDe(jour), jour);
    // Dossier RH relié au compte (direction comprise) ; à défaut, la fiche
    // d'équipe seule (pas encore de dossier ouvert par la RH).
    const dossier = await this.prisma.dossierPersonnel.findFirst({
      where: ouDossierDuCompte(a.userId),
      include: INCLUDE_DOSSIER,
    });
    const fiche = dossier
      ? null
      : await this.prisma.collaborateur.findFirst({
          where: { utilisateurId: a.userId, societeId: a.societeId },
          select: { id: true, dateArrivee: true },
        });
    if (!dossier && !fiche) throw new NotFoundException('Aucun dossier du personnel pour ce compte — voir avec la RH.');

    // Sans dossier RH : pas d'absence validée possible, entrée = arrivée de la fiche.
    const salarie = dossier ? salarieDe(dossier) : { dateEntree: fiche!.dateArrivee, dateSortie: null, absences: [] };
    const collabId = dossier ? dossier.collaborateur?.id : fiche!.id;
    const taches = collabId ? await chargerTachesAssignees(this.prisma, [collabId]) : [];
    const societeId = dossier?.societeId ?? a.societeId;
    const feries = (await this.reglages.joursFeries([societeId])).get(societeId)!;
    return {
      mois: cible,
      periodes: moisEntre(MOIS_DEBUT_FEUILLES, moisDe(jour)),
      feuille: calculer(cible, salarie, dossier?.controlesTemps ?? [], taches, jour, feries),
      // Sans dossier RH, pas de signalement possible (la RH n'a rien à corriger).
      signalable: !!dossier,
      ecart: dossier ? ecartDuMois(dossier.ecartsTemps, cible) : null,
    };
  }

  // --- Écart signalé (revue Salarié 19/10/2026) ----------------------------
  // Le salarié ne confirme pas sa feuille : sans signalement, elle est juste.
  // Il signale un écart tant que la RH n'a pas figé le mois.

  async signalerEcart(a: Acteur, mois: string, commentaire: string) {
    const jour = aujourdhui();
    moisValide(mois, jour);
    const d = await this.prisma.dossierPersonnel.findFirst({
      where: ouDossierDuCompte(a.userId),
      include: INCLUDE_DOSSIER,
    });
    if (!d) throw new NotFoundException('Aucun dossier du personnel pour ce compte — voir avec la RH.');
    if (d.controlesTemps.some((c) => c.mois === mois)) {
      throw new ConflictException('Feuille déjà contrôlée par la RH : voyez directement avec elle.');
    }
    if (d.ecartsTemps.some((e) => e.mois === mois && !e.traiteLe)) {
      throw new ConflictException('Un écart est déjà signalé pour ce mois : la RH va vous répondre.');
    }
    await this.prisma.ecartFeuilleTemps.create({
      data: { dossierId: d.id, mois, commentaire: commentaire.trim(), signaleParId: a.userId },
    });
    await this.notifications.envoyer({
      societeId: d.societeId,
      type: 'ecart_temps_signale',
      titre: `Écart signalé · ${d.prenom} ${d.nom} · feuille de temps ${deMois(mois)}`,
      destinataireIds: await this.notifications.titulairesRole(d.societeId, ROLE_RH),
      parId: a.userId,
    });
    return this.monTemps(a, mois);
  }

  // La RH a corrigé la source si besoin (absence, fenêtre de tâche) et répond.
  async traiterEcart(userId: string, ecartId: string, reponse: string) {
    const e = await this.prisma.ecartFeuilleTemps.findUnique({
      where: { id: ecartId },
      include: {
        dossier: {
          select: { societeId: true, utilisateurId: true, collaborateur: { select: { utilisateurId: true } } },
        },
      },
    });
    if (!e) throw new NotFoundException('Écart introuvable');
    if (e.traiteLe) throw new ConflictException('Écart déjà traité.');
    const { count } = await this.prisma.ecartFeuilleTemps.updateMany({
      where: { id: ecartId, traiteLe: null },
      data: { reponse: reponse.trim(), traiteLe: new Date(), traiteParId: userId },
    });
    if (!count) throw new ConflictException('Écart déjà traité.');
    await this.notifications.envoyer({
      societeId: e.dossier.societeId,
      type: 'ecart_temps_traite',
      titre: `La RH a répondu à votre écart · feuille de temps ${deMois(e.mois)}`,
      destinataireIds: [e.dossier.utilisateurId ?? e.dossier.collaborateur?.utilisateurId],
      parId: userId,
    });
    return { id: ecartId, mois: e.mois };
  }
}

// Feuille d'un salarié pour un mois : la version figée si elle a été
// contrôlée, sinon le calcul en direct.
function calculer(
  mois: string,
  salarie: Salarie,
  controles: Controle[],
  taches: TacheAssignee[],
  jour: string,
  feries: Feries,
): FeuilleCalculee {
  const controle = controles.find((c) => c.mois === mois);
  if (controle) {
    const detail = controle.detail as unknown as DetailFige;
    const imputees = Number(controle.heuresImputees);
    const disponibles = Number(controle.heuresDisponibles);
    return {
      mois,
      statut: 'controlee',
      heuresImputees: imputees,
      heuresDisponibles: disponibles,
      joursAbsence: controle.joursAbsence,
      occupation: disponibles > 0 ? Math.round((imputees / disponibles) * 100) : null,
      controleLe: controle.controleLe,
      lignes: detail.lignes,
      calendrier: null,
    };
  }

  // Détail du mois : les tâches dont la fenêtre touche le mois.
  const m = bornesMois(mois);
  const duMois = taches.filter((t) => planifiee(t) && t.debut! <= m.fin && t.echeance! >= m.debut);
  const f = feuilleDuMois(mois, salarie, duMois, jour, feries);
  const statut: StatutFeuille =
    mois >= moisDe(jour)
      ? 'en_cours'
      : jour < controleOuvertLe(mois)
        ? 'cloture'
        : f.heuresImputees > 0
          ? 'a_controler'
          : 'sans_heures';
  return {
    mois,
    statut,
    heuresImputees: f.heuresImputees,
    heuresDisponibles: f.heuresDisponibles,
    joursAbsence: f.joursAbsence,
    occupation: f.occupation,
    controleLe: null,
    calendrier: calendrierDuMois(mois, salarie, duMois, jour, feries),
    lignes: duMois.map((t, i) => ({
      id: t.id,
      etape: t.etape,
      libelle: t.libelle,
      projetCode: t.projetCode,
      projetProgramme: t.projetProgramme,
      debut: t.debut!,
      echeance: t.echeance!,
      dureeStandard: t.heures,
      jours: f.lignes[i].jours,
      heures: f.lignes[i].heures,
      manque: f.lignes[i].manque,
    })),
  };
}

function dernierMoisClos(jour: string): string {
  const [a, m] = moisDe(jour).split('-').map(Number);
  const precedent = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  return precedent < MOIS_DEBUT_FEUILLES ? moisDe(jour) : precedent;
}

function moisValide(mois: string, jour: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois) || mois < MOIS_DEBUT_FEUILLES || mois > moisDe(jour)) {
    throw new BadRequestException(`Mois hors période (de ${MOIS_DEBUT_FEUILLES} au mois en cours).`);
  }
  return mois;
}
