import type { MotifSalaire, StatutSalaire } from '@prisma/client';
import { formatDate, toIsoDay } from '@hub/domain';

// Historique des salaires (revue RH validée 20/10/2026) — règles pures.

export type ChangementSource = {
  montant: number;
  dateEffet: string | null;
  statut: StatutSalaire;
  decideLe: Date | null;
};

// Date d'effet dans le passé : 3 mois au plus (le salaire d'entrée suit la
// date d'entrée, sans limite — reprise des salariés déjà en poste).
export const RETROACTIVITE_MAX_MOIS = 3;

export const LIBELLE_MOTIF_SALAIRE: Record<MotifSalaire, string> = {
  embauche: "salaire d'entrée",
  augmentation: 'augmentation',
  promotion: 'promotion',
  fin_essai: "fin d'essai",
  correction: 'correction',
};

// Salaire en vigueur le `jour` : le dernier changement VALIDÉ dont la date
// d'effet est passée (date inconnue = depuis toujours) ; à date d'effet
// égale, le dernier validé l'emporte. null = aucun salaire.
export function salaireAu(changements: ChangementSource[], jour: string): number | null {
  const enVigueur = changements
    .filter((c) => c.statut === 'valide' && (c.dateEffet ?? '') <= jour)
    .sort(
      (a, b) =>
        (a.dateEffet ?? '').localeCompare(b.dateEffet ?? '') ||
        (a.decideLe?.getTime() ?? 0) - (b.decideLe?.getTime() ?? 0),
    );
  return enVigueur.at(-1)?.montant ?? null;
}

// Plus ancienne date d'effet admise le `jour` (même quantième, 3 mois avant ;
// ramené au dernier jour du mois si besoin : 31/05 → 28/02).
export function dateEffetMin(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number);
  const cible = new Date(Date.UTC(a, m - 1 - RETROACTIVITE_MAX_MOIS, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(j, dernier));
  return toIsoDay(cible);
}

// Motif d'erreur, ou null si la proposition est recevable.
export function refusProposition(
  p: { montant: number; dateEffet: string; motif: MotifSalaire },
  aDejaUnSalaire: boolean,
  jour: string,
): string | null {
  if (!Number.isInteger(p.montant) || p.montant <= 0)
    return 'Le montant doit être un nombre entier de FCFA, supérieur à 0.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateEffet) || Number.isNaN(Date.parse(`${p.dateEffet}T00:00:00Z`)))
    return "Date d'effet invalide.";
  if (p.motif === 'embauche' && aDejaUnSalaire)
    return "Le salaire d'entrée est déjà fixé : choisissez augmentation, promotion, fin d'essai ou correction.";
  if (p.motif !== 'embauche' && !aDejaUnSalaire) return "Aucun salaire validé : proposez d'abord le salaire d'entrée.";
  if (p.motif !== 'embauche' && p.dateEffet < dateEffetMin(jour)) {
    return `Date d'effet trop ancienne : ${RETROACTIVITE_MAX_MOIS} mois en arrière au plus (à partir du ${formatDate(dateEffetMin(jour))}).`;
  }
  return null;
}
