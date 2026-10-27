import { plural } from '@hub/domain';
import type { ProductionRow, ProductionView } from './types';

// Libellés et tons du tableau de production (fonctions pures, testées).

export type LoadTone = 'risque' | 'succes' | 'info' | 'neutre';
type LoadTarget = ProductionView['charge']['zone'];

// Ce qui attend une décision sur le projet (remises, visas, prolongations, TS).
export function pendingLabels(a: ProductionRow['attente']): string[] {
  return [
    a.remises && plural(a.remises, 'remise'),
    a.visas && `${plural(a.visas, 'visa')} DPLG`,
    a.prolongations && plural(a.prolongations, 'prolongation'),
    a.ts && plural(a.ts, 'TS'),
  ].filter((x): x is string => !!x);
}

// Ton d'une charge : au-dessus de la zone normale = surcharge, en dessous =
// sous-charge, dedans = normal (zone des Réglages, 70 à 100 % par défaut).
export function loadTone(pct: number | null, zone: LoadTarget): LoadTone {
  if (pct === null) return 'neutre';
  const z = zone ?? { de: 70, a: 100 };
  return pct > z.a ? 'risque' : pct >= z.de ? 'succes' : 'info';
}

// « 1 tâche en souffrance dans 01 · Onboard », ou le total et les étapes.
export function laggingLabel(lagging: ProductionRow['souffrance'], stepNumber: (n: number) => string): string {
  if (lagging.length === 1) {
    const s = lagging[0];
    return `${plural(s.taches, 'tâche')} en souffrance dans ${stepNumber(s.numero)} · ${s.libelle}`;
  }
  const total = lagging.reduce((t, s) => t + s.taches, 0);
  return `${plural(total, 'tâche')} en souffrance : ${lagging.map((s) => `${stepNumber(s.numero)} (${s.taches})`).join(', ')}`;
}

// Échéances des 14 jours : livraisons et fins de cartes clés, par date.
export function upcomingDeadlines(view: ProductionView) {
  return [
    ...view.livraisons.map((l) => ({
      cle: `liv-${l.projetId}`,
      le: l.livraisonLe,
      texte: `Livraison · ${l.code} · ${l.client}`,
      projetId: l.projetId,
    })),
    ...view.lignes.flatMap((l) =>
      l.echeances.map((e) => ({
        cle: `${l.projet.id}-${e.carte}`,
        le: e.finLe,
        texte: `${e.carte} · ${l.projet.code}`,
        projetId: l.projet.id,
      })),
    ),
  ].sort((a, b) => a.le.localeCompare(b.le));
}
