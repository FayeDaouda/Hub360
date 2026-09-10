// Fenêtres temporelles du tableau de bord — calcul pur, testable, sans I/O.
//
// Bornes calculées en UTC : déterministe, indépendant du fuseau du serveur, et
// ≈ l'heure locale de Dakar (Sénégal = UTC+0 toute l'année). Une fenêtre est
// un intervalle demi-ouvert [debut, fin).

export type Periode = 'jour' | 'semaine' | 'mois' | 'annee';
export const PERIODES: Periode[] = ['jour', 'semaine', 'mois', 'annee'];

export function estPeriode(v: unknown): v is Periode {
  return typeof v === 'string' && (PERIODES as string[]).includes(v);
}

export type Fenetre = { debut: Date; fin: Date };

const JOUR_MS = 86_400_000;

const jourUTC = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// Lundi 00:00 UTC de la semaine ISO contenant `d`.
function lundiUTC(d: Date): Date {
  const base = jourUTC(d);
  const depuisLundi = (base.getUTCDay() + 6) % 7; // 0 = lundi … 6 = dimanche
  return new Date(base.getTime() - depuisLundi * JOUR_MS);
}

const moisUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const anneeUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
const ajouterMois = (d: Date, n: number) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

// Fenêtre courante + fenêtre précédente de même nature (juste avant).
export function fenetres(
  periode: Periode,
  maintenant: Date,
): { courante: Fenetre; precedente: Fenetre } {
  switch (periode) {
    case 'jour': {
      const debut = jourUTC(maintenant);
      const fin = new Date(debut.getTime() + JOUR_MS);
      return {
        courante: { debut, fin },
        precedente: { debut: new Date(debut.getTime() - JOUR_MS), fin: debut },
      };
    }
    case 'semaine': {
      const debut = lundiUTC(maintenant);
      const fin = new Date(debut.getTime() + 7 * JOUR_MS);
      return {
        courante: { debut, fin },
        precedente: { debut: new Date(debut.getTime() - 7 * JOUR_MS), fin: debut },
      };
    }
    case 'mois': {
      const debut = moisUTC(maintenant);
      const fin = ajouterMois(debut, 1);
      return {
        courante: { debut, fin },
        precedente: { debut: ajouterMois(debut, -1), fin: debut },
      };
    }
    case 'annee': {
      const debut = anneeUTC(maintenant);
      const fin = new Date(Date.UTC(debut.getUTCFullYear() + 1, 0, 1));
      return {
        courante: { debut, fin },
        precedente: {
          debut: new Date(Date.UTC(debut.getUTCFullYear() - 1, 0, 1)),
          fin: debut,
        },
      };
    }
  }
}

const CAP = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts });

// Libellé lisible de la fenêtre courante (« Jeudi 10 septembre 2026 »,
// « Semaine du 8 au 14 septembre 2026 », « 1 – 30 septembre 2026 »,
// « Année 2026 »).
export function libellePeriode(periode: Periode, maintenant: Date): string {
  const { courante } = fenetres(periode, maintenant);
  const dernierJour = new Date(courante.fin.getTime() - JOUR_MS);

  switch (periode) {
    case 'jour':
      return CAP(
        fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
          courante.debut,
        ),
      );
    case 'semaine': {
      const j = fmt({ day: 'numeric' });
      const memeMois = courante.debut.getUTCMonth() === dernierJour.getUTCMonth();
      const fin = memeMois
        ? `${j.format(dernierJour)} ${fmt({ month: 'long', year: 'numeric' }).format(dernierJour)}`
        : fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(dernierJour);
      const debut = memeMois
        ? j.format(courante.debut)
        : fmt({ day: 'numeric', month: 'long' }).format(courante.debut);
      return `Semaine du ${debut} au ${fin}`;
    }
    case 'mois':
      return `${courante.debut.getUTCDate()} – ${dernierJour.getUTCDate()} ${fmt({
        month: 'long',
        year: 'numeric',
      }).format(courante.debut)}`;
    case 'annee':
      return `Année ${courante.debut.getUTCFullYear()}`;
  }
}

// Numéro de semaine ISO 8601.
function semaineIso(d: Date): number {
  const cible = jourUTC(d);
  // jeudi de la semaine ISO courante
  cible.setUTCDate(cible.getUTCDate() + 3 - ((cible.getUTCDay() + 6) % 7));
  const premierJeudi = new Date(Date.UTC(cible.getUTCFullYear(), 0, 4));
  premierJeudi.setUTCDate(
    premierJeudi.getUTCDate() + 3 - ((premierJeudi.getUTCDay() + 6) % 7),
  );
  return 1 + Math.round((cible.getTime() - premierJeudi.getTime()) / (7 * JOUR_MS));
}

export type Bucket = { libelle: string; fenetre: Fenetre; actif: boolean };

// Barres de l'histogramme « nouveaux projets signés » : la fenêtre courante et
// les précédentes (5 pas, 6 pour le mois), la dernière marquée `actif`.
export function bucketsHistogramme(periode: Periode, maintenant: Date): Bucket[] {
  const { courante } = fenetres(periode, maintenant);
  const out: Bucket[] = [];

  const pousser = (debut: Date, fin: Date, libelle: string) =>
    out.push({ fenetre: { debut, fin }, libelle, actif: false });

  if (periode === 'jour') {
    for (let i = 4; i >= 0; i--) {
      const debut = new Date(courante.debut.getTime() - i * JOUR_MS);
      pousser(
        debut,
        new Date(debut.getTime() + JOUR_MS),
        CAP(fmt({ weekday: 'short' }).format(debut).replace('.', '')),
      );
    }
  } else if (periode === 'semaine') {
    for (let i = 4; i >= 0; i--) {
      const debut = new Date(courante.debut.getTime() - i * 7 * JOUR_MS);
      pousser(debut, new Date(debut.getTime() + 7 * JOUR_MS), `S${semaineIso(debut)}`);
    }
  } else if (periode === 'mois') {
    for (let i = 5; i >= 0; i--) {
      const debut = ajouterMois(courante.debut, -i);
      pousser(
        debut,
        ajouterMois(debut, 1),
        CAP(fmt({ month: 'short' }).format(debut).replace('.', '')),
      );
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const an = courante.debut.getUTCFullYear() - i;
      pousser(
        new Date(Date.UTC(an, 0, 1)),
        new Date(Date.UTC(an + 1, 0, 1)),
        String(an),
      );
    }
  }

  out[out.length - 1].actif = true;
  return out;
}

export function uniteHistogramme(periode: Periode): string {
  return {
    jour: 'projets par jour',
    semaine: 'projets par semaine',
    mois: 'projets par mois',
    annee: 'projets par an',
  }[periode];
}

// Moyenne entière d'une liste de pourcentages ; 0 sur liste vide (jamais NaN).
export function moyennePct(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  return Math.round(valeurs.reduce((s, n) => s + n, 0) / valeurs.length);
}

// Un jalon est « à risque » s'il échoit dans les `seuilJours` jours (ou est
// déjà dépassé), sinon « à faire ». Dates AAAA-MM-JJ comparées en UTC.
export function statutJalon(
  dateJalon: string,
  aujourdhui: string,
  seuilJours = 3,
): 'a_faire' | 'a_risque' {
  const d = Date.parse(`${dateJalon}T00:00:00Z`);
  const a = Date.parse(`${aujourdhui}T00:00:00Z`);
  return (d - a) / JOUR_MS <= seuilJours ? 'a_risque' : 'a_faire';
}

// `Date` → AAAA-MM-JJ (UTC). Utilitaire de normalisation des dates de jalons.
export function isoJour(d: Date): string {
  return d.toISOString().slice(0, 10);
}
