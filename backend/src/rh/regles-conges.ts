// Règles de congés — HYPOTHÈSES DE TRAVAIL (conception d'origine, jamais
// confirmées par un vrai titulaire RH) : à ajuster ici, en un seul endroit,
// dès qu'un RH en poste les corrige.
//  - Jours OUVRABLES : lundi → samedi (seul le dimanche est exclu).
//  - Acquisition : 2 jours ouvrables par mois complet de service de l'année
//    civile (maquette « Mon espace » : « Acquis 2026 ») ;
//  - Report des années antérieures : non modélisé (politique à fixer par la
//    RH) — 0, comme sur la maquette.
//  - Jours fériés : déduits (liste des Réglages · Règles et délais).
export const JOURS_ACQUIS_PAR_MOIS = 2;

// « Autres dates » présélectionné quand au moins cette part de la cellule
// serait absente en même temps (hypothèse : la moitié).
export const PART_CELLULE_ABSENTE_ALERTE = 0.5;

const jour = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function joursOuvrables(debut: string, fin: string, feries: ReadonlySet<string> = new Set()): number {
  let n = 0;
  for (let d = jour(debut); d <= jour(fin); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0 && !feries.has(iso(d))) n++;
  }
  return n;
}

export function veille(date: string): string {
  const d = jour(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}

export function chevauche(a: { debut: string; fin: string }, b: { debut: string; fin: string }): boolean {
  return a.debut <= b.fin && b.debut <= a.fin;
}

// Mois complets écoulés depuis l'entrée (0 sans date d'entrée).
export function moisComplets(dateEntree: string | null, aujourdhui: string): number {
  if (!dateEntree || dateEntree > aujourdhui) return 0;
  const [a1, m1, j1] = dateEntree.split('-').map(Number);
  const [a2, m2, j2] = aujourdhui.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) - (j2 < j1 ? 1 : 0);
}

export type Solde = { annee: number; report: number; acquis: number; pris: number; enAttente: number; disponible: number };

// Solde de l'année civile en cours. Seuls les congés payés entament le solde ;
// « en attente » = demandes pas encore tranchées (réservées, pour ne pas
// surcharger le solde). Restant (disponible) = report + acquis − pris − en attente.
export function soldeConges(
  dateEntree: string | null,
  conges: { type: string; statut: string; jours: number; dateDebut: string }[],
  aujourdhui: string,
): Solde {
  const annee = Number(aujourdhui.slice(0, 4));
  const debutAnnee = `${annee}-01-01`;
  const depuis = dateEntree && dateEntree > debutAnnee ? dateEntree : debutAnnee;
  const acquis = dateEntree ? moisComplets(depuis, aujourdhui) * JOURS_ACQUIS_PAR_MOIS : 0;
  const report = 0;
  const cp = conges.filter((c) => c.type === 'conge_paye' && c.dateDebut.startsWith(String(annee)));
  const pris = cp.filter((c) => c.statut === 'validee').reduce((t, c) => t + c.jours, 0);
  const enAttente = cp
    .filter((c) => ['attente_n1', 'autres_dates', 'accord_n1'].includes(c.statut))
    .reduce((t, c) => t + c.jours, 0);
  return { annee, report, acquis, pris, enAttente, disponible: report + acquis - pris - enAttente };
}
