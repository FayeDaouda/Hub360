import type { Feries } from '../../rh/regles-temps';
import { ecartHeures, joursDeRetard } from './calendrier';

// États affichés d'un projet ouvert selon le gabarit (maquette « Projets ») —
// dérivés des dates figées et du statut enregistré, jamais stockés. Pures.

export type StatutTache = 'a_faire' | 'a_valider' | 'reprise' | 'validee' | 'non_necessaire';

export type TacheSource = {
  cle: string;
  libelle: string;
  statut: StatutTache;
  debutLe: string | null;
  finLe: string | null;
  version: number;
  valideeLe: string | null; // AAAA-MM-JJ
  // Prolongation accordée : le retard est qualifié jusqu'à cette date ;
  // l'échéance de référence (finLe) reste figée.
  prolongeeJusquau?: string | null;
  // Visa DPLG (revue Dir. GC, 21/10/2026) : exigé, et apposé le… (AAAA-MM-JJ).
  visaRequis?: boolean;
  viseeLe?: string | null;
};

export type CarteSource = {
  cle: string;
  etapeNumero: number;
  etapeCle: string;
  fichiers: boolean;
  desactivation: string | null;
  ouvreApres: string[];
  taches: TacheSource[];
};

export type EtatTache =
  | { code: 'desactivee' }
  | { code: 'non_necessaire' }
  | { code: 'verrouillee' }
  | { code: 'validee'; ecart: number | null } // heures : + avance, − retard
  | { code: 'a_viser' } // validée par le chef de team, visa DPLG à apposer
  | { code: 'a_valider'; version: number }
  | { code: 'reprise'; version: number }
  | { code: 'en_retard'; jours: number }
  | { code: 'prolongee'; jusquau: string; jours: number } // retard qualifié (jours depuis la référence)
  | { code: 'en_cours' }
  | { code: 'a_venir' };

export type EtatCarte =
  | { code: 'desactivee'; motif: string }
  | { code: 'rubriques' }
  | { code: 'verrouillee'; attend: string[] } // libellés des tâches attendues
  | { code: 'close'; le: string | null }
  | { code: 'ouverte' };

export type EtatEtape = 'en_retard' | 'en_cours' | 'a_venir' | 'terminee';

export type ResumeEtape = { numero: number; faites: number; total: number; enRetard: number; etat: EtatEtape };

// Faite : non nécessaire, ou validée — et visée quand le visa DPLG est exigé.
export const enAttenteVisa = (t: TacheSource) => t.statut === 'validee' && !!t.visaRequis && !t.viseeLe;
const faite = (t: TacheSource) => t.statut === 'non_necessaire' || (t.statut === 'validee' && !enAttenteVisa(t));

// Le dépôt du permis attend les plans visés : une tâche « depot » reste
// verrouillée tant qu'une tâche de sa carte attend son visa DPLG.
export const attendVisa = (t: TacheSource, carte: CarteSource) => t.cle === 'depot' && carte.taches.some(enAttenteVisa);

// Tâches dont dépend l'ouverture d'une carte, non encore faites.
function attentes(carte: CarteSource, toutes: Map<string, TacheSource>): TacheSource[] {
  return carte.ouvreApres.map((ref) => toutes.get(ref)).filter((t): t is TacheSource => !!t && !faite(t));
}

export function indexTaches(cartes: CarteSource[]): Map<string, TacheSource> {
  return new Map(cartes.flatMap((c) => c.taches.map((t) => [`${c.cle}.${t.cle}`, t] as const)));
}

export function etatCarte(carte: CarteSource, toutes: Map<string, TacheSource>): EtatCarte {
  if (carte.desactivation) return { code: 'desactivee', motif: carte.desactivation };
  if (carte.fichiers) return { code: 'rubriques' };
  const attend = attentes(carte, toutes);
  if (attend.length) return { code: 'verrouillee', attend: attend.map((t) => t.libelle) };
  const utiles = carte.taches.filter((t) => t.statut !== 'non_necessaire');
  if (utiles.every(faite)) {
    const dates = utiles.map((t) => t.valideeLe).filter((d): d is string => !!d).sort();
    return { code: 'close', le: dates.at(-1) ?? null };
  }
  return { code: 'ouverte' };
}

export function etatTache(t: TacheSource, carte: EtatCarte, aujourdhui: string, feries: Feries, verrouVisa = false): EtatTache {
  if (carte.code === 'desactivee') return { code: 'desactivee' };
  if (t.statut === 'non_necessaire') return { code: 'non_necessaire' };
  if (enAttenteVisa(t)) return { code: 'a_viser' };
  if (t.statut === 'validee') {
    return { code: 'validee', ecart: t.valideeLe && t.finLe ? ecartHeures(t.valideeLe, t.finLe, feries) : null };
  }
  if (t.statut === 'a_valider') return { code: 'a_valider', version: t.version };
  if (t.statut === 'reprise') return { code: 'reprise', version: t.version + 1 };
  if (carte.code === 'verrouillee' || verrouVisa) return { code: 'verrouillee' };
  if (t.finLe && aujourdhui > t.finLe) {
    const jours = joursDeRetard(t.finLe, aujourdhui);
    return t.prolongeeJusquau && aujourdhui <= t.prolongeeJusquau ? { code: 'prolongee', jusquau: t.prolongeeJusquau, jours } : { code: 'en_retard', jours };
  }
  if (t.debutLe && aujourdhui >= t.debutLe) return { code: 'en_cours' };
  return { code: 'a_venir' };
}

// Compteurs « x/y tâches » : y hors tâches non nécessaires et cartes
// désactivées ; x = tâches validées.
export function resumeEtape(numero: number, etats: { tache: TacheSource; etat: EtatTache }[]): ResumeEtape {
  const comptees = etats.filter((e) => e.etat.code !== 'desactivee' && e.etat.code !== 'non_necessaire');
  const faites = comptees.filter((e) => e.etat.code === 'validee').length;
  const enRetard = comptees.filter((e) => e.etat.code === 'en_retard').length;
  const demarree = comptees.some((e) => ['en_cours', 'prolongee', 'validee', 'a_viser', 'a_valider', 'reprise'].includes(e.etat.code));
  const etat: EtatEtape =
    enRetard > 0 ? 'en_retard' : comptees.length > 0 && faites === comptees.length ? 'terminee' : demarree ? 'en_cours' : 'a_venir';
  return { numero, faites, total: comptees.length, enRetard, etat };
}

// Ce qu'attendent F2 et F3 (pastilles de la maquette : « F2 attend 02, 03,
// récépissé 04 », « F3 attend 06, 1 visa(s) d'étude »). Vide = plus rien.
export function attentesFactures(etapes: ResumeEtape[], cartes: CarteSource[]): { F2: string[]; F3: string[] } {
  const terminee = (n: number) => etapes.find((e) => e.numero === n)?.etat === 'terminee';
  const actives = cartes.filter((c) => !c.desactivation);
  const depot = actives.find((c) => c.cle === 'permis_construire')?.taches.find((t) => t.cle === 'depot');
  const visas = actives
    .filter((c) => c.etapeCle === 'etudes')
    .flatMap((c) => c.taches)
    .filter((t) => /visa BC/i.test(t.libelle) && !faite(t)).length;
  // Plans d'exécution validés mais pas encore visés par l'architecte DPLG.
  const visasDplg = actives.filter((c) => c.etapeNumero === 6).flatMap((c) => c.taches).filter(enAttenteVisa).length;
  return {
    F2: [...[2, 3].filter((n) => !terminee(n)).map((n) => String(n).padStart(2, '0')), ...(depot && !faite(depot) ? ['récépissé 04'] : [])],
    F3: [...(terminee(6) ? [] : ['06']), ...(visas ? [`${visas} visa(s) d'étude`] : []), ...(visasDplg ? [`${visasDplg} visa(s) DPLG`] : [])],
  };
}
