import { salaireAu, type ChangementSource } from '../../rh/regles-salaire';
import { bornesMois, joursOuvres, type Feries } from '../../rh/regles-temps';

// Rentabilité par projet, phase 1 (lot 7, décisions du 21/10/2026) — règles
// pures. Indicateur : MARGE DIRECTE PROVISOIRE = montant HT facturé − coût
// salarial direct des heures imputées et contrôlées par la RH. Ni charges
// patronales (sauf coefficient activé par le CFO), ni dépenses, ni frais
// généraux : jamais une « rentabilité ».

export type CleParametre = 'heures_annuelles' | 'coefficient_charges' | 'marge_cible';

// Valeurs par défaut (pas d'expert-comptable pour l'instant) : modifiables
// par le CFO, chacune affichée comme « non validée ».
export const PARAMETRES: Record<
  CleParametre,
  { libelle: string; defaut: number | null; min: number; max: number; unite: string; videPermis: boolean }
> = {
  // Durée légale de 40 h par semaine au Sénégal : 40 × 52 = 2 080 h par an,
  // soit 173,333… h par mois. Stockée en heures ANNUELLES (valeur exacte) et
  // divisée par 12 au calcul : 520 000 FCFA donnent exactement 3 000 FCFA/h.
  heures_annuelles: {
    libelle: 'Heures annuelles de référence (÷ 12 par mois)',
    defaut: 2080,
    min: 100,
    max: 4000,
    unite: 'h par an',
    videPermis: false,
  },
  // Vide = charges patronales désactivées (non comprises dans le coût).
  coefficient_charges: {
    libelle: 'Coefficient de charges patronales',
    defaut: null,
    min: 0,
    max: 100,
    unite: '%',
    videPermis: true,
  },
  // Vide = pas de couleur de statut.
  marge_cible: { libelle: 'Marge directe cible', defaut: null, min: 0, max: 100, unite: '%', videPermis: true },
};

export type LigneParametre = { cle: string; valeur: number | null; dateEffet: string; createdAt: Date };

// Valeur en vigueur le `jour` : la dernière ligne dont la date d'effet est
// passée (à date égale, la plus récente) ; sinon la valeur par défaut.
export function parametreAu(lignes: LigneParametre[], cle: CleParametre, jour: string): number | null {
  const l = lignes
    .filter((x) => x.cle === cle && x.dateEffet <= jour)
    .sort((a, b) => a.dateEffet.localeCompare(b.dateEffet) || a.createdAt.getTime() - b.createdAt.getTime())
    .at(-1);
  return l ? l.valeur : PARAMETRES[cle].defaut;
}

// Premier mois où un nouveau paramètre peut prendre effet : le mois en cours
// (un mois passé ne se réécrit pas).
export const premierMoisModifiable = (aujourdhui: string) => `${aujourdhui.slice(0, 7)}-01`;

// Salaire du mois au prorata des jours ouvrés (décision 2, recommandation) :
// moyenne des salaires en vigueur chaque jour ouvré. null = aucun salaire
// validé ce mois-là ; les jours sans salaire ne comptent pas.
export function salaireDuMois(changements: ChangementSource[], mois: string, feries: Feries): number | null {
  const jours = joursOuvres(bornesMois(mois), feries);
  const valeurs = jours.map((j) => salaireAu(changements, j)).filter((s): s is number => s !== null);
  if (!valeurs.length) return null;
  return valeurs.reduce((t, s) => t + s, 0) / valeurs.length;
}

// Coût d'une heure d'un salarié pour un mois : salaire ÷ (heures annuelles
// ÷ 12), majoré des charges si le coefficient est activé. Aucun arrondi ici :
// seul l'affichage arrondit.
export function coutHoraire(salaireMois: number, heuresAnnuelles: number, coefficientCharges: number | null): number {
  return ((salaireMois * 12) / heuresAnnuelles) * (1 + (coefficientCharges ?? 0) / 100);
}

// Taux de marge : « Non calculable » (null) si rien n'est facturé.
export const tauxMarge = (htFacture: number, marge: number) => (htFacture > 0 ? (marge / htFacture) * 100 : null);

export type Statut = 'vert' | 'ambre' | 'rouge' | null;

// Couleur par rapport à la marge directe cible (frais généraux) : sans cible
// ou sans taux, pas de couleur.
export function statutMarge(taux: number | null, cible: number | null): Statut {
  if (taux === null || cible === null) return null;
  if (taux >= cible) return 'vert';
  return taux >= 0 ? 'ambre' : 'rouge';
}

// Mois arrêté (revue CFO, 21/10/2026) : le dernier mois clos dont TOUTES les
// feuilles sont contrôlées (ou sans heures), sans trou depuis le premier mois
// suivi. Le cumul s'arrête là pour le facturé COMME pour le coût — sinon les
// factures récentes face à des heures pas encore contrôlées gonflent la marge.
// `mois` : mois clos dans l'ordre, avec le statut de chaque feuille.
export function moisArrete(mois: { mois: string; statuts: string[] }[]): string | null {
  let arrete: string | null = null;
  for (const m of [...mois].sort((x, y) => x.mois.localeCompare(y.mois))) {
    if (!m.statuts.every((s) => s === 'controlee' || s === 'sans_heures')) break;
    arrete = m.mois;
  }
  return arrete;
}
