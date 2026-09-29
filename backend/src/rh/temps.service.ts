import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SectionTache } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  arrondi,
  bornesMois,
  etatTache,
  feuilleDuMois,
  heuresTache,
  joursAbsents,
  type Manque,
  manqueTache,
  MOIS_DEBUT_FEUILLES,
  moisDe,
  moisEntre,
  periodeComptee,
  type Salarie,
} from './regles-temps';
import { chargerDurees, chargerTachesAssignees, groupeConnu, SECTIONS_TACHES, type TacheAssignee } from './taches-assignees';

type Acteur = { userId: string; societeId: string };

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export type StatutFeuille = 'en_cours' | 'a_controler' | 'sans_heures' | 'controlee';

// Ligne de calcul d'une feuille (aussi figée telle quelle au contrôle).
export type LigneCalcul = {
  id: string;
  section: SectionTache;
  libelle: string;
  projetCode: string;
  projetProgramme: string;
  debut: string;
  echeance: string;
  dureeStandard: number | null;
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
};

const INCLUDE_DOSSIER = {
  societe: { select: { nom: true } },
  collaborateur: { select: { id: true, cellule: { select: { nom: true } } } },
  absences: { where: { statut: 'validee' }, select: { dateDebut: true, dateFin: true } },
  controlesTemps: true,
} satisfies Prisma.DossierPersonnelInclude;
type DossierTemps = Prisma.DossierPersonnelGetPayload<{ include: typeof INCLUDE_DOSSIER }>;
type Controle = DossierTemps['controlesTemps'][number];

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
  constructor(private prisma: PrismaService) {}

  // --- Référentiel des durées standard (paramètres société) ----------------

  async durees(societeId: string) {
    const durees = await chargerDurees(this.prisma, [societeId]);
    return SECTIONS_TACHES.map((s) => ({
      section: s.section,
      libelle: s.libelle,
      groupes: s.groupes.map((g) => ({ ...g, heures: durees.get(`${societeId}:${s.section}:${g.groupe}`) ?? null })),
    }));
  }

  async definirDuree(societeId: string, userId: string, section: string, groupe: string, heures: number | null) {
    if (!groupeConnu(section, groupe)) throw new NotFoundException('Bloc inconnu.');
    const id = { societeId, section: section as SectionTache, groupe };
    if (heures == null) {
      await this.prisma.dureeStandardTache.deleteMany({ where: id });
    } else {
      await this.prisma.dureeStandardTache.upsert({
        where: { societeId_section_groupe: id },
        create: { ...id, heures, majParId: userId },
        update: { heures, majParId: userId },
      });
    }
    return this.durees(societeId);
  }

  // --- Feuilles de temps (RH, périmètre groupe) ----------------------------

  async feuilles(mois?: string) {
    const jour = aujourdhui();
    const cible = moisValide(mois ?? dernierMoisClos(jour), jour);
    const dossiers = await this.prisma.dossierPersonnel.findMany({
      where: { OR: [{ archiveLe: null }, { archiveLe: { gte: new Date(`${MOIS_DEBUT_FEUILLES}-01T00:00:00Z`) } }] },
      include: INCLUDE_DOSSIER,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    const taches = await chargerTachesAssignees(
      this.prisma,
      dossiers.flatMap((d) => (d.collaborateur ? [d.collaborateur.id] : [])),
    );
    const tachesDe = (d: DossierTemps) => taches.filter((t) => t.collaborateurId === d.collaborateur?.id);
    const presentsEn = (m: string) => dossiers.filter((d) => periodeComptee(m, salarieDe(d), jour));

    const periodes = moisEntre(MOIS_DEBUT_FEUILLES, moisDe(jour)).map((m) => ({
      mois: m,
      clos: m < moisDe(jour),
      aControler: presentsEn(m).filter(
        (d) => calculer(m, salarieDe(d), d.controlesTemps, tachesDe(d), jour).statut === 'a_controler',
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
        ...calculer(cible, salarieDe(d), d.controlesTemps, tachesDe(d), jour),
      })),
    };
  }

  // Fige la feuille d'un mois clos telle que calculée à cet instant.
  async controler(userId: string, dossierId: string, mois: string) {
    const jour = aujourdhui();
    moisValide(mois, jour);
    if (mois >= moisDe(jour)) throw new ConflictException('Seul un mois clos peut être contrôlé.');
    const d = await this.prisma.dossierPersonnel.findUnique({ where: { id: dossierId }, include: INCLUDE_DOSSIER });
    if (!d) throw new NotFoundException('Dossier introuvable');
    if (!periodeComptee(mois, salarieDe(d), jour)) throw new ConflictException("Ce salarié n'était pas présent ce mois-là.");
    if (d.controlesTemps.some((c) => c.mois === mois)) throw new ConflictException('Feuille déjà contrôlée.');

    const taches = d.collaborateur ? await chargerTachesAssignees(this.prisma, [d.collaborateur.id]) : [];
    const f = calculer(mois, salarieDe(d), [], taches, jour);
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
    const collab = await this.prisma.collaborateur.findFirst({
      where: { utilisateurId: a.userId, societeId: a.societeId },
      select: { id: true, dateArrivee: true, dossierPersonnel: { include: INCLUDE_DOSSIER } },
    });
    if (!collab) throw new NotFoundException('Aucune fiche collaborateur pour ce compte.');

    const dossier = collab.dossierPersonnel;
    // Sans dossier RH : pas d'absence validée possible, entrée = arrivée de la fiche.
    const salarie = dossier ? salarieDe(dossier) : { dateEntree: collab.dateArrivee, dateSortie: null, absences: [] };
    const taches = await chargerTachesAssignees(this.prisma, [collab.id]);
    const absents = joursAbsents(salarie.absences);

    return {
      mois: cible,
      periodes: moisEntre(MOIS_DEBUT_FEUILLES, moisDe(jour)),
      feuille: calculer(cible, salarie, dossier?.controlesTemps ?? [], taches, jour),
      taches: taches
        .map((t) => ({
          id: t.id,
          section: t.section,
          libelle: t.libelle,
          projetId: t.projetId,
          projetCode: t.projetCode,
          projetProgramme: t.projetProgramme,
          debut: t.debut,
          echeance: t.echeance,
          dureeStandard: t.heures,
          heuresImputees: planifiee(t) ? arrondi(heuresTache(t, absents, { debut: t.debut!, fin: jour })) : 0,
          etat: etatTache(t, jour),
          manque: manqueTache(t, absents),
        }))
        .sort((x, y) => (x.echeance ?? '9999').localeCompare(y.echeance ?? '9999')),
    };
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
    };
  }

  // Détail du mois : les blocs dont la fenêtre touche le mois.
  const m = bornesMois(mois);
  const duMois = taches.filter((t) => planifiee(t) && t.debut! <= m.fin && t.echeance! >= m.debut);
  const f = feuilleDuMois(mois, salarie, duMois, jour);
  const statut: StatutFeuille =
    mois >= moisDe(jour) ? 'en_cours' : f.heuresImputees > 0 ? 'a_controler' : 'sans_heures';
  return {
    mois,
    statut,
    heuresImputees: f.heuresImputees,
    heuresDisponibles: f.heuresDisponibles,
    joursAbsence: f.joursAbsence,
    occupation: f.occupation,
    controleLe: null,
    lignes: duMois.map((t, i) => ({
      id: t.id,
      section: t.section,
      libelle: t.libelle,
      projetCode: t.projetCode,
      projetProgramme: t.projetProgramme,
      debut: t.debut!,
      echeance: t.echeance!,
      dureeStandard: t.heures,
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
