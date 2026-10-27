import type { StatutTacheProjet } from '@prisma/client';
import { onTimeShare } from '../teams/teams-rules';
import { pourcentage } from './pilotage-regles';

// Tendances mois par mois des indicateurs qui SE MESURENT par mois (les autres
// — conversion, ponctualité des reportings, contrôle des feuilles — sont des
// cumuls : une courbe mensuelle n'y aurait pas de sens).
export const MOIS_TENDANCE = 6;
export type Point = { mois: string; valeur: number | null };

// Les `n` derniers mois (AAAA-MM), le mois courant en dernier.
export function derniersMois(moisCourant: string, n = MOIS_TENDANCE): string[] {
  const [a, m] = moisCourant.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

type TacheValidee = { statut: StatutTacheProjet; valideeLe: string | null; echeance: string | null; reprise: boolean };

// Nouveaux leads de conception créés chaque mois.
export function serieNouveaux(mois: string[], creations: string[]): Point[] {
  return mois.map((m) => ({ mois: m, valeur: creations.filter((c) => c.startsWith(m)).length }));
}

// Parmi les tâches VALIDÉES dans le mois : part à temps, part ayant eu une reprise.
export function seriesTaches(mois: string[], taches: TacheValidee[]): { aTemps: Point[]; reprises: Point[] } {
  const duMois = (m: string) => taches.filter((t) => t.statut === 'validee' && t.valideeLe?.startsWith(m));
  return {
    aTemps: mois.map((m) => ({
      mois: m,
      valeur: onTimeShare(
        duMois(m).map((t) => ({
          statut: t.statut,
          valideeLe: t.valideeLe,
          echeance: t.echeance,
          debut: null,
          heures: null,
        })),
      ),
    })),
    reprises: mois.map((m) => {
      const v = duMois(m);
      return { mois: m, valeur: v.length ? pourcentage(v.filter((t) => t.reprise).length, v.length) : null };
    }),
  };
}
