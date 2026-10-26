import type { ClienteleCellule, EtatPosteCellule, ProcessusCellule, StatutCellule } from './types';
import type { PillTone } from '@/components/ui/pill';

// Équipes (maquette du boss, oct. 2026) : nomenclature des cellules selon
// ISO 9001 — format SOCIÉTÉ-PROCESSUS-NN.
export const PROCESSUS: Record<ProcessusCellule, { libelle: string; iso: string }> = {
  DIR: { libelle: 'Pilotage et direction', iso: '§5 Leadership · §9.3 Revue de direction' },
  ARC: { libelle: 'Réalisation · conception architecturale', iso: '§8.3 Conception et développement' },
  INT: { libelle: 'Réalisation · architecture intérieure', iso: '§8.3 Conception et développement' },
  ETU: {
    libelle: 'Réalisation · études techniques',
    iso: '§8.4 Maîtrise des prestataires externes (bureaux d’études)',
  },
};
// Ordre de la nomenclature (DIR d'abord) et du formulaire de création (ARC d'abord).
export const PROCESSUS_NOMENCLATURE: ProcessusCellule[] = ['DIR', 'ARC', 'INT', 'ETU'];
export const PROCESSUS_CREATION: ProcessusCellule[] = ['ARC', 'INT', 'ETU', 'DIR'];

export const CLIENTELES: Record<ClienteleCellule, string> = {
  externes: 'Clients externes',
  holding: 'Interne (Holding)',
  tous: 'Tous projets',
  sans_objet: 'Sans objet',
};

export const STATUTS_CELLULE: Record<StatutCellule, { libelle: string; ton: PillTone }> = {
  active: { libelle: 'Active', ton: 'succes' },
  a_constituer: { libelle: 'À constituer', ton: 'attention' },
  reportee: { libelle: 'Reportée', ton: 'neutre' },
};

export const ETATS_POSTE: Record<EtatPosteCellule, string> = {
  occupe: '', // le titulaire
  ouvert: 'Poste ouvert · à affecter',
  reporte: 'Reporté',
  a_recruter: 'À recruter',
  externe: 'Externe · prestataires',
};
