import type { PillTone } from '@/components/ui/pill';
import type { CellClientele, CellProcess, CellStatus, EmployeeLevel, PositionState } from './types';

// Équipes (maquette du boss, oct. 2026) : nomenclature des cellules selon
// ISO 9001 — format SOCIÉTÉ-PROCESSUS-NN.
export const PROCESSES: Record<CellProcess, { libelle: string; iso: string }> = {
  DIR: { libelle: 'Pilotage et direction', iso: '§5 Leadership · §9.3 Revue de direction' },
  ARC: { libelle: 'Réalisation · conception architecturale', iso: '§8.3 Conception et développement' },
  INT: { libelle: 'Réalisation · architecture intérieure', iso: '§8.3 Conception et développement' },
  ETU: {
    libelle: 'Réalisation · études techniques',
    iso: '§8.4 Maîtrise des prestataires externes (bureaux d’études)',
  },
};
// Ordre de la nomenclature (DIR d'abord) et du formulaire de création (ARC d'abord).
export const NOMENCLATURE_ORDER: CellProcess[] = ['DIR', 'ARC', 'INT', 'ETU'];
export const CREATION_ORDER: CellProcess[] = ['ARC', 'INT', 'ETU', 'DIR'];

export const CLIENTELES: Record<CellClientele, string> = {
  externes: 'Clients externes',
  holding: 'Interne (Holding)',
  tous: 'Tous projets',
  sans_objet: 'Sans objet',
};

export const CELL_STATUSES: Record<CellStatus, { libelle: string; ton: PillTone }> = {
  active: { libelle: 'Active', ton: 'succes' },
  a_constituer: { libelle: 'À constituer', ton: 'attention' },
  reportee: { libelle: 'Reportée', ton: 'neutre' },
};

export const POSITION_STATES: Record<PositionState, string> = {
  occupe: '', // le titulaire
  ouvert: 'Poste ouvert · à affecter',
  reporte: 'Reporté',
  a_recruter: 'À recruter',
  externe: 'Externe · prestataires',
};

export const EMPLOYEE_LEVELS: Record<EmployeeLevel, string> = {
  stagiaire: 'Stagiaire',
  junior: 'Junior',
  confirme: 'Confirmé',
  senior: 'Senior',
  lead: 'Lead',
};
