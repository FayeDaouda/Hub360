// RH · Temps de travail (lot 4). Règles pures, testées.
//
// Tirées des maquettes « Feuilles de temps » et « Mon espace » (manuel non reçu) :
//  - calcul automatique à partir des tâches assignées dans les projets, hors
//    absences validées : personne ne saisit ni ne modifie d'heures ;
//  - la durée standard de chaque tâche est répartie sur sa fenêtre (début →
//    échéance) ;
//  - 8 h par jour ouvré, du lundi au vendredi : la maquette donne 168 h pour
//    août 2026 (21 jours ouvrés) et 88 h avec 10 jours d'absence (11 × 8) ;
//  - le mois en cours est compté jusqu'à aujourd'hui (154,9 h « imputées » le
//    23/09 sur une fenêtre de 17 jours ouvrés).
// HYPOTHÈSES DE TRAVAIL (à valider avec la RH) :
//  - la durée se répartit à parts égales sur les jours ouvrés de la fenêtre où
//    le salarié est présent : une absence reporte la charge sur ses autres
//    jours, elle ne l'efface pas ;
//  - les jours fériés (Réglages · Règles et délais) sortent du calendrier
//    ouvrable : ni disponibles, ni porteurs de charge.
export const HEURES_PAR_JOUR = 8;

export type Feries = ReadonlySet<string>; // AAAA-MM-JJ
export const AUCUN_FERIE: Feries = new Set();

// Premier mois couvert : aucun bloc n'avait de date de début avant la mise en
// service des feuilles de temps, il n'y a donc rien à calculer avant.
export const MOIS_DEBUT_FEUILLES = '2026-09';

export type Periode = { debut: string; fin: string }; // AAAA-MM-JJ inclus

export type Tache = {
  id: string;
  debut: string | null;
  echeance: string | null;
  heures: number | null; // durée standard ; null = non définie
};

// Raison pour laquelle une tâche ne produit aucune heure.
export type Manque = 'duree' | 'debut' | 'echeance' | 'fenetre' | 'absence';

const jour = (iso: string) => new Date(`${iso}T00:00:00Z`);
const versIso = (d: Date) => d.toISOString().slice(0, 10);
const max = (a: string, b: string) => (a > b ? a : b);
const min = (a: string, b: string) => (a < b ? a : b);

export const arrondi = (n: number) => Math.round(n * 10) / 10;

// Jours ouvrés (lundi → vendredi, hors fériés) de l'intervalle, bornes incluses.
export function joursOuvres(p: Periode, feries: Feries = AUCUN_FERIE): string[] {
  const jours: string[] = [];
  for (let d = jour(p.debut); d <= jour(p.fin); d.setUTCDate(d.getUTCDate() + 1)) {
    const j = d.getUTCDay();
    if (j !== 0 && j !== 6 && !feries.has(versIso(d))) jours.push(versIso(d));
  }
  return jours;
}

export function moisDe(date: string): string {
  return date.slice(0, 7);
}

export function bornesMois(mois: string): Periode {
  const [a, m] = mois.split('-').map(Number);
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { debut: `${mois}-01`, fin: `${mois}-${String(dernier).padStart(2, '0')}` };
}

// Le contrôle RH d'un mois clos s'ouvre le 3 du mois suivant (revue RH
// validée, 20/10/2026) : le temps que les dernières absences et remises du
// mois soient saisies.
export const JOUR_OUVERTURE_CONTROLE = 3;
export function controleOuvertLe(mois: string): string {
  const [a, m] = mois.split('-').map(Number);
  const suivant = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  return `${suivant}-${String(JOUR_OUVERTURE_CONTROLE).padStart(2, '0')}`;
}

// Mois de `depuis` à `jusqua` inclus (AAAA-MM), dans l'ordre.
export function moisEntre(depuis: string, jusqua: string): string[] {
  const liste: string[] = [];
  const [a0, m0] = depuis.split('-').map(Number);
  for (
    let d = new Date(Date.UTC(a0, m0 - 1, 1));
    versIso(d).slice(0, 7) <= jusqua;
    d.setUTCMonth(d.getUTCMonth() + 1)
  ) {
    liste.push(versIso(d).slice(0, 7));
  }
  return liste;
}

// Jours ouvrés couverts par des absences validées (ensemble, sans doublon).
export function joursAbsents(absences: Periode[], feries: Feries = AUCUN_FERIE): Set<string> {
  return new Set(absences.flatMap((a) => joursOuvres(a, feries)));
}

export function manqueTache(t: Tache, absents: Set<string>, feries: Feries = AUCUN_FERIE): Manque | null {
  if (!t.debut) return 'debut';
  if (!t.echeance) return 'echeance';
  if (t.debut > t.echeance) return 'fenetre';
  if (t.heures == null || t.heures <= 0) return 'duree';
  if (!joursOuvres({ debut: t.debut, fin: t.echeance }, feries).some((j) => !absents.has(j))) return 'absence';
  return null;
}

// Jours ouvrés de présence de la fenêtre situés dans `p` (colonne « Jours »
// de Mon temps) et sur toute la fenêtre.
function joursPresents(t: Tache, absents: Set<string>, p: Periode, feries: Feries) {
  const presents = joursOuvres({ debut: t.debut!, fin: t.echeance! }, feries).filter((j) => !absents.has(j));
  return { dansPeriode: presents.filter((j) => j >= p.debut && j <= p.fin).length, total: presents.length };
}

export function joursTache(t: Tache, absents: Set<string>, p: Periode, feries: Feries = AUCUN_FERIE): number {
  if (manqueTache(t, absents, feries) || p.debut > p.fin) return 0;
  return joursPresents(t, absents, p, feries).dansPeriode;
}

// Heures de la tâche tombant dans `p` (non arrondies) : durée × jours présents
// de la fenêtre situés dans `p` ÷ jours présents de toute la fenêtre.
export function heuresTache(t: Tache, absents: Set<string>, p: Periode, feries: Feries = AUCUN_FERIE): number {
  if (manqueTache(t, absents, feries) || p.debut > p.fin) return 0;
  const { dansPeriode, total } = joursPresents(t, absents, p, feries);
  return (t.heures! * dansPeriode) / total;
}

export type Salarie = {
  dateEntree: string | null;
  // Départ effectif (archivage du dossier) ; la fin prévue d'un CDD n'en est
  // pas une tant que le dossier n'est pas archivé.
  dateSortie: string | null;
  absences: Periode[];
};

// Période effectivement comptée pour ce mois : bornée par l'entrée, la
// sortie et, pour le mois en cours, par aujourd'hui. `null` si vide.
export function periodeComptee(mois: string, s: Salarie, aujourdhui: string): Periode | null {
  const m = bornesMois(mois);
  const debut = s.dateEntree ? max(m.debut, s.dateEntree) : m.debut;
  let fin = min(m.fin, aujourdhui);
  if (s.dateSortie) fin = min(fin, s.dateSortie);
  return debut <= fin ? { debut, fin } : null;
}

export type LigneFeuille = { id: string; jours: number; heures: number; manque: Manque | null };

// Calendrier du mois (Mon temps, 19/10/2026) : chaque jour, sa nature et ses
// heures — même répartition que heuresTache, jour par jour (la somme des
// jours retombe sur les heures imputées, aux arrondis près).
export type NatureJour = 'travail' | 'absence' | 'ferie' | 'weekend' | 'hors';
export type JourCalendrier = { date: string; nature: NatureJour; heures: number };

export function calendrierDuMois(
  mois: string,
  s: Salarie,
  taches: Tache[],
  aujourdhui: string,
  feries: Feries = AUCUN_FERIE,
): JourCalendrier[] {
  const absents = joursAbsents(s.absences, feries);
  const p = periodeComptee(mois, s, aujourdhui);
  const m = bornesMois(mois);
  // Par tâche planifiée : ses jours présents et la part d'heures de chacun.
  const parts = taches
    .filter((t) => !manqueTache(t, absents, feries))
    .map((t) => {
      const presents = joursOuvres({ debut: t.debut!, fin: t.echeance! }, feries).filter((j) => !absents.has(j));
      return { jours: new Set(presents), parJour: t.heures! / presents.length };
    });
  const jours: JourCalendrier[] = [];
  for (let d = jour(m.debut); d <= jour(m.fin); d.setUTCDate(d.getUTCDate() + 1)) {
    const date = versIso(d);
    const js = d.getUTCDay();
    const nature: NatureJour =
      js === 0 || js === 6
        ? 'weekend'
        : feries.has(date)
          ? 'ferie'
          : !p || date < p.debut || date > p.fin
            ? 'hors'
            : absents.has(date)
              ? 'absence'
              : 'travail';
    const heures = nature === 'travail' ? parts.reduce((n, x) => n + (x.jours.has(date) ? x.parJour : 0), 0) : 0;
    jours.push({ date, nature, heures: arrondi(heures) });
  }
  return jours;
}

export type Feuille = {
  heuresImputees: number;
  heuresDisponibles: number;
  joursAbsence: number;
  occupation: number | null; // % entier ; null sans heure disponible
  lignes: LigneFeuille[];
};

export function feuilleDuMois(
  mois: string,
  s: Salarie,
  taches: Tache[],
  aujourdhui: string,
  feries: Feries = AUCUN_FERIE,
): Feuille {
  const absents = joursAbsents(s.absences, feries);
  const p = periodeComptee(mois, s, aujourdhui);
  const ouvres = p ? joursOuvres(p, feries) : [];
  const joursAbsence = ouvres.filter((j) => absents.has(j)).length;
  const heuresDisponibles = (ouvres.length - joursAbsence) * HEURES_PAR_JOUR;
  const lignes = taches.map((t) => ({
    id: t.id,
    jours: p ? joursTache(t, absents, p, feries) : 0,
    heures: p ? arrondi(heuresTache(t, absents, p, feries)) : 0,
    manque: manqueTache(t, absents, feries),
  }));
  const brut = p ? taches.reduce((n, t) => n + heuresTache(t, absents, p, feries), 0) : 0;
  return {
    heuresImputees: arrondi(brut),
    heuresDisponibles,
    joursAbsence,
    occupation: heuresDisponibles > 0 ? Math.round((brut / heuresDisponibles) * 100) : null,
    lignes,
  };
}

export type EtatTache = 'a_venir' | 'en_cours' | 'terminee';

// État de la fenêtre d'une tâche (et non de son avancement, suivi ailleurs).
export function etatTache(t: Tache, aujourdhui: string): EtatTache | null {
  if (!t.debut || !t.echeance) return null;
  if (aujourdhui < t.debut) return 'a_venir';
  return aujourdhui <= t.echeance ? 'en_cours' : 'terminee';
}
