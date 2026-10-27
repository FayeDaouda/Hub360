'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, ChevronDown, X } from 'lucide-react';
import { plural } from '@hub/domain';
import { TaskGroup } from './task-group';
import { FILTERS, SECTION_TITLES, SECTIONS, groupByProject, type Filter, type TaskGroups } from './task-groups';
import type { MyTask } from './types';
import type { View } from './my-tasks-header';

// Liste principale : par urgence (sections, puis « Plus tard » replié) ou
// par projet ; avec un filtre, sa liste complète. Les mentions sans tâche
// affichée ont leur section, sauf quand la colonne de droite les montre.
export function TaskList({
  groups,
  view,
  filter,
  filterCount,
  withAside,
  selection,
  looseMentions,
  renderTask,
  onShowAll,
}: {
  groups: TaskGroups;
  view: View;
  filter: Filter | null;
  filterCount: number;
  withAside: boolean;
  selection: MyTask[];
  // Lignes de mention déjà rendues.
  looseMentions: ReactNode[];
  renderTask: (t: MyTask, withoutProject?: boolean) => ReactNode;
  onShowAll: () => void;
}) {
  const activeFilter = FILTERS.find((f) => f.key === filter);
  return (
    <section className="panel glass-panel mt-liste" aria-live="polite">
      {activeFilter && (
        <div className="mt-filtre-etat">
          <span>{`${activeFilter.label} · ${filterCount}`}</span>
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={onShowAll}>
            <X size={14} aria-hidden /> Tout afficher
          </button>
        </div>
      )}

      {!filter && groups.urgent === 0 && (
        <div className="mt-calme">
          <CheckCircle2 size={28} aria-hidden />
          <div>
            <p className="mt-calme-titre">Tout est à jour</p>
            <p>Rien en retard, rien à reprendre, rien à rendre d’ici dimanche.</p>
          </div>
        </div>
      )}

      {view === 'projet' && filter !== 'mentions' ? (
        groupByProject(selection, groups.rank).map((p) => (
          <TaskGroup key={p.projetId} title={`${p.code} · ${p.client}`} tone="neutre" count={p.tasks.length} project>
            {p.tasks.map((t) => renderTask(t, true))}
          </TaskGroup>
        ))
      ) : (
        <>
          {/* Sans filtre : sections sans compteur (déjà sur les cartes, et une
              reprise en retard n'est listée qu'une fois). Avec un filtre : sa
              liste complète. */}
          {SECTIONS.filter((s) => (filter === null || filter === s) && !(withAside && s === 'attente')).map((s) => {
            const list = filter ? groups[s] : groups.sections[s];
            // Une reprise en retard est listée une fois, sous « En retard » :
            // la section le dit, pour que le compteur de la carte (qui la
            // compte aussi) se comprenne.
            const elsewhere = filter ? 0 : groups[s].length - groups.sections[s].length;
            const note = elsewhere > 0 ? `et ${plural(elsewhere, 'autre')} en retard, plus haut` : undefined;
            return (
              <TaskGroup
                key={s}
                title={SECTION_TITLES[s]}
                tone={FILTERS.find((x) => x.key === s)!.tone}
                count={list.length}
                hideTitle={!!filter}
                noCount
                note={note}
              >
                {list.map((t) => renderTask(t))}
              </TaskGroup>
            );
          })}
          {filter === null && groups.later.length > 0 && (
            <details className="mt-plus-tard">
              <summary>
                <ChevronDown size={16} aria-hidden className="mt-plus-tard-chevron" />
                Plus tard · {groups.later.length}
              </summary>
              <ul className="mt-lignes">{groups.later.map((t) => renderTask(t))}</ul>
            </details>
          )}
        </>
      )}

      {(filter === null || filter === 'mentions') && !withAside && (
        <TaskGroup title="Mentions" tone="iris" count={looseMentions.length} hideTitle={filter === 'mentions'} noCount>
          {looseMentions}
        </TaskGroup>
      )}
    </section>
  );
}
