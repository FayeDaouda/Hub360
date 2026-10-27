import { daysBetween, formatDayMonth, todayIso } from '@hub/domain';
import type { CardState, EmployeeLoad, ProjectStep, ProjectTask, SiteStatus, TaskState, TaskWorkload } from './types';

// Libellés et pastilles du module Projets (maquette « Projets »).

// Mêmes tons que les pastilles .pill--* (couleur = sens) : « à valider »
// attend une décision → attention ; désactivé / non nécessaire → neutre.
export type Tone = 'succes' | 'attention' | 'risque' | 'info' | 'neutre';

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  conception: 'En conception',
  chantier: 'En chantier',
  livre: 'Livré',
};

// Journée de travail : le budget atelier (heures) se lit en jours ouvrés.
export const HOURS_PER_DAY = 8;

export const stepNumber = (n: number) => String(n).padStart(2, '0');
const v = (n: number) => `v${String(n).padStart(2, '0')}`;

// Pastille d'une tâche : libellé + ton.
// `echeance` (date effective : accordée ou de référence) : une reprise dont
// l'échéance est passée est aussi en retard — même règle que « Mes tâches »
// (le retard est un attribut, pas une catégorie).
export function taskPill(e: TaskState, echeance?: string | null): { libelle: string; ton: Tone } {
  switch (e.code) {
    case 'validee':
      if (e.ecart && e.ecart > 0) return { libelle: `Validé · avance ${e.ecart} h`, ton: 'succes' };
      if (e.ecart && e.ecart < 0) return { libelle: `Validé · +${-e.ecart} h`, ton: 'attention' };
      return { libelle: 'Validé', ton: 'succes' };
    case 'a_viser':
      return { libelle: 'Visa DPLG à apposer', ton: 'attention' };
    case 'a_valider':
      return { libelle: `À valider · ${v(e.version)}`, ton: 'attention' };
    case 'reprise': {
      const jour = todayIso();
      if (echeance && echeance < jour) {
        const jours = daysBetween(echeance, jour);
        return { libelle: `Reprise · ${jours} j de retard`, ton: 'risque' };
      }
      return { libelle: `Reprise · ${v(e.version)}`, ton: 'attention' };
    }
    case 'en_retard':
      return { libelle: `En retard · ${e.jours} j`, ton: 'risque' };
    case 'prolongee':
      return { libelle: `Retard qualifié · jusqu’au ${formatDayMonth(e.jusquau)}`, ton: 'attention' };
    case 'en_cours':
      return { libelle: 'En cours', ton: 'info' };
    case 'verrouillee':
      return { libelle: 'Verrouillée', ton: 'neutre' };
    case 'non_necessaire':
      return { libelle: 'Non nécessaire', ton: 'neutre' };
    case 'desactivee':
      return { libelle: 'Désactivée', ton: 'neutre' };
    default:
      return { libelle: 'À venir', ton: 'neutre' };
  }
}

export function cardPill(e: CardState): { libelle: string; ton: Tone } {
  switch (e.code) {
    case 'desactivee':
      return { libelle: `Désactivée · ${e.motif}`, ton: 'neutre' };
    case 'rubriques':
      return { libelle: 'Rubriques', ton: 'neutre' };
    case 'verrouillee':
      return { libelle: 'Verrouillée', ton: 'neutre' };
    case 'close':
      return { libelle: e.le ? `Close le ${formatDayMonth(e.le)}` : 'Close', ton: 'succes' };
    default:
      return { libelle: 'Ouverte', ton: 'info' };
  }
}

export function stepPill(e: ProjectStep): { libelle: string; ton: Tone } {
  if (e.etat === 'en_retard') return { libelle: `${e.enRetard} en retard`, ton: 'risque' };
  if (e.etat === 'terminee') return { libelle: 'Terminée', ton: 'succes' };
  if (e.etat === 'en_cours') return { libelle: 'En cours', ton: 'info' };
  return { libelle: 'À venir', ton: 'neutre' };
}

// Temps standard d'une tâche, tel qu'affiché dans la ligne (maquette : « 8 h »,
// « 3,4 h », « — » sans temps atelier).
export function taskHoursLabel(t: ProjectTask): string {
  if (t.heures !== null) return `${String(t.heures).replace('.', ',')} h`;
  if (t.temps.type === 'partage' && t.temps.heures) return `${t.temps.heures} h`;
  return '—';
}

// Libellé court d'une charge (liste « Assigner »).
export function workloadLabel(c: EmployeeLoad | undefined, zone: TaskWorkload['zone']): string {
  if (!c) return '';
  if (c.pourcentage === null) return 'absent sur la période';
  const etat = zone && c.pourcentage > zone.a ? ' · surchargé' : zone && c.pourcentage < zone.de ? ' · disponible' : '';
  return `charge ${c.pourcentage} %${etat}`;
}
