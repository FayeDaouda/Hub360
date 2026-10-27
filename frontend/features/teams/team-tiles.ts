import { plural } from '@hub/domain';
import type { TeamsView } from './types';

// Les cinq listes de la page Équipes, chacune ouverte par son indicateur.
export type TeamList = 'cellules' | 'affecter' | 'projets' | 'taches' | 'absences';

export type TeamTile = { key: TeamList; label: string; value: string; hint: string; tone?: string };

// Indicateurs de la page Équipes (maquette du boss, oct. 2026), calculés au
// back (`indicateurs`) ; seuls leurs libellés se composent ici.
// `pendingAbsences` : null tant que le nombre n'est pas connu.
export function teamTiles(view: TeamsView, canWrite: boolean, pendingAbsences: number | null): TeamTile[] {
  const i = view.indicateurs;
  return [
    {
      key: 'cellules',
      label: 'Cellules',
      value: `${i.cellules.actives} / ${i.cellules.total}`,
      hint: canWrite ? 'actives · créer, consulter' : 'actives · consulter',
    },
    {
      key: 'affecter',
      label: 'Salariés à affecter',
      value: String(i.salariesAAffecter),
      hint: 'sans cellule',
      tone: i.salariesAAffecter ? 'attention' : undefined,
    },
    {
      key: 'projets',
      label: 'Projets signés',
      value: String(i.projetsSignes.total),
      hint: i.projetsSignes.nonAffectes ? `${i.projetsSignes.nonAffectes} à affecter` : 'tous affectés',
      tone: i.projetsSignes.nonAffectes ? 'attention' : undefined,
    },
    {
      // Des tâches ; « soit N étapes » fait le lien avec le reporting de la direction.
      key: 'taches',
      label: 'Tâches en cours',
      value: String(i.taches.enCours),
      hint: `${i.taches.pctATemps ?? 100} % à temps · ${i.taches.enRetard} en retard${
        i.taches.enRetard ? `, soit ${plural(i.taches.etapesEnRetard, 'étape')}` : ''
      }`,
      tone: 'risque',
    },
    {
      key: 'absences',
      label: 'Absences à décider',
      value: pendingAbsences == null ? '…' : String(pendingAbsences),
      hint: `${i.absencesEnAttente} en attente dans la société (décision N+1)`,
    },
  ];
}
