import type { NotificationType } from '@/lib/types';
import { ROLE_CEO, ROLE_EMPLOYEE, ROLE_HR } from '@hub/domain';

// Deux blocs (revue Salarié 19/10/2026) : le travail au quotidien, puis le
// dossier personnel — neuf onglets à plat étaient trop chargés. Les clés sont
// celles de l'adresse (?onglet=), inchangées pour les liens directs.
export const TAB_GROUPS = [
  { key: 'travail', label: 'Mon travail' },
  { key: 'dossier', label: 'Mon dossier' },
] as const;
export type TabGroup = (typeof TAB_GROUPS)[number]['key'];

export const TABS = [
  { key: 'performances', label: 'Mes performances', needsFile: false, group: 'travail' },
  { key: 'temps', label: 'Mon temps', needsFile: false, group: 'travail' },
  { key: 'cellule', label: 'Ma cellule', needsFile: false, group: 'travail' },
  { key: 'a-valider', label: 'À valider', needsFile: false, group: 'travail' },
  { key: 'mission', label: 'Ma carte de mission', needsFile: true, group: 'travail' },
  { key: 'conges', label: 'Congés et absences', needsFile: true, group: 'dossier' },
  { key: 'remboursements', label: 'Remboursements santé', needsFile: true, group: 'dossier' },
  { key: 'informations', label: 'Mes informations', needsFile: true, group: 'dossier' },
  { key: 'documents', label: 'Mes documents', needsFile: true, group: 'dossier' },
] as const;
export type Tab = (typeof TABS)[number]['key'];

// Nouveautés par onglet (pastilles) : notifications non lues de ces types,
// marquées lues à l'ouverture de l'onglet.
export const TAB_NEWS: Partial<Record<Tab, NotificationType[]>> = {
  performances: ['tache_validee'],
  temps: ['ecart_temps_traite'],
  conges: ['absence_decidee'],
  remboursements: ['remboursement_traite'],
  documents: ['bulletin_depose', 'attestation_delivree'],
};

// Rôles qui ne valident rien (maquettes RH et Salarié) : « À valider »
// n'apparaît pour eux que si quelque chose les attend.
const WITHOUT_REVIEWS = new Set([ROLE_HR, ROLE_EMPLOYEE]);
// Salarié pas encore affecté à une équipe : bandeau d'explication (maquette).
export const AWAITING_TEAM = new Set([ROLE_EMPLOYEE]);
// Rôles hors circuit des tâches (le CEO n'en reçoit jamais) : ni
// performances, ni temps, ni cellule — son espace s'ouvre sur « À valider »
// (N+1 des directeurs) et ses demandes personnelles.
export const WITHOUT_TASKS = new Set([ROLE_CEO]);
const TASK_TABS = new Set<Tab>(['performances', 'temps', 'cellule']);

// Onglets visibles pour ce rôle. La carte de mission n'apparaît que quand la
// RH l'a rédigée (nouvel arrivant).
export function visibleTabs(role: string, hasMission: boolean, toReview: number) {
  return TABS.filter(
    (t) =>
      (t.key !== 'mission' || hasMission) &&
      (t.key !== 'a-valider' || toReview > 0 || !WITHOUT_REVIEWS.has(role)) &&
      !(WITHOUT_TASKS.has(role) && TASK_TABS.has(t.key)),
  );
}
