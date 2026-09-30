import { apiSociete } from './client-api';

// Réglages du HUB (CIO) — maquette du boss, sept. 2026. API NestJS :
//   GET …/reglages                    gabarits en service, règles, objectifs
//   GET …/reglages/journal            journal des modifications
//   PUT …/reglages/gabarits/:code     { depuis, motif, changements } → nouvelle version
//   PUT …/reglages/regles             { motif, valeurs }
//   PUT …/reglages/objectifs          { motif, valeurs }
// Miroir de backend/src/reglages/gabarit.ts et definitions.ts.

export type Fenetre = { debut: number; fin: number };
export type Temps =
  | { type: 'heures'; heures: number }
  | { type: 'par_unite'; heures: number; unite: 'pièce' | 'vue' }
  | { type: 'total'; heures: number }
  | { type: 'partage'; libelle: string }
  | { type: 'charge_gc'; charge: 'notice' | 'cachet' | 'timbre' }
  | { type: 'sans' };
export type TacheGabarit = { cle: string; libelle: string; fenetre?: Fenetre; temps: Temps };
export type CarteGabarit = {
  cle: string;
  libelle: string;
  note?: string;
  fenetre?: Fenetre;
  temps?: Temps;
  client?: boolean;
  desactivee?: boolean;
  fichiers?: boolean;
  taches: TacheGabarit[];
};
export type EtapeGabarit = { numero: number; cle: string; libelle: string; cartes: CarteGabarit[] };
export type GabaritEnService = {
  code: string;
  numero: number;
  libelle: string;
  contenu: { etapes: EtapeGabarit[] };
  creeLe: string;
  projets: number;
};

export type TypeValeur =
  | { type: 'entier'; min: number; max: number; unite?: string }
  | { type: 'parts'; cles: string[] }
  | { type: 'heures'; cles: string[] }
  | { type: 'choix'; options: { valeur: string; libelle: string }[] }
  | { type: 'texte'; max: number }
  | { type: 'dates' }
  | { type: 'pourcentage' }
  | { type: 'zone' };
export type Reglage = {
  cle: string;
  libelle: string;
  valeur: TypeValeur;
  aide: string;
  appliquee: boolean;
  propose: string | null;
  enService: unknown;
};

export type Reglages =
  | { disponible: false }
  | { disponible: true; gabarits: GabaritEnService[]; regles: Reglage[]; objectifs: Reglage[]; modifications: number };

export type Changement = { carte: string; tache?: string; champ: 'debut' | 'fin' | 'heures'; valeur: number };
export type LigneJournal = { id: string; lot: string; section: string; libelle: string; motif: string; par: string | null; createdAt: string };

export const getReglages = (slug: string) => apiSociete<Reglages>(slug, '/reglages');
export const getJournalReglages = (slug: string) => apiSociete<LigneJournal[]>(slug, '/reglages/journal');
export const enregistrerGabarit = (slug: string, code: string, corps: { depuis: number; motif: string; changements: Changement[] }) =>
  apiSociete<Reglages>(slug, `/reglages/gabarits/${code}`, { method: 'PUT', body: corps });
export const enregistrerValeurs = (slug: string, section: 'regles' | 'objectifs', corps: { motif: string; valeurs: Record<string, unknown> }) =>
  apiSociete<Reglages>(slug, `/reglages/${section}`, { method: 'PUT', body: corps });

export const libelleVersion = (numero: number) => `bêta 1.${numero}`;
const jjmmaaaa = (iso: string) => iso.split('-').reverse().join('/');

// Valeur « en service », lisible (même rendu que le journal côté serveur).
export function afficher(r: Pick<Reglage, 'valeur'>, v: unknown): string {
  if (v === null || v === undefined) return 'à fixer';
  const t = r.valeur;
  if (t.type === 'parts') return t.cles.map((k) => (v as Record<string, number>)[k]).join(' / ') + ' %';
  if (t.type === 'heures') return t.cles.map((k) => `${k} ${(v as Record<string, number>)[k]} h`).join(' · ');
  if (t.type === 'choix') return t.options.find((o) => o.valeur === v)?.libelle.replace(' (défaut)', '') ?? String(v);
  if (t.type === 'dates') return (v as string[]).length ? (v as string[]).map(jjmmaaaa).join(', ') : 'aucun';
  if (t.type === 'zone') return `${(v as { de: number }).de} à ${(v as { a: number }).a} %`;
  if (t.type === 'pourcentage') return `${v} %`;
  if (t.type === 'entier' && t.unite) return `${Number(v).toLocaleString('fr-FR')} ${t.unite}`;
  return String(v);
}
