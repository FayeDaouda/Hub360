'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { plural, todayIso } from '@hub/domain';
import { useEnteteFixe } from '@/lib/entete-fixe';
import { lireFichier } from '@/lib/fichiers';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { useMediaQuery } from '@/lib/media';
import { prenomAffiche } from '@/lib/profil';
import { marquerMentionLue, type MentionRecue } from '@/lib/projets-ouverts';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';
import { DepositToast } from './deposit-toast';
import { MentionRow } from './mention-row';
import { MyTasksHeader, type View } from './my-tasks-header';
import { ReviewerAside } from './reviewer-aside';
import { SubmissionModal } from './submission-modal';
import { TaskDrawer } from './task-drawer';
import { FILTERS, SECTIONS, groupTasks, type Filter } from './task-groups';
import { TaskList } from './task-list';
import { TaskRow } from './task-row';
import type { MyTask } from './types';
import { useFileDrag } from './use-file-drag';
import { useMyTasks } from './use-my-tasks';
import { useTaskShortcuts } from './use-task-shortcuts';

const MAX_FILES = 5;
const VIEW_KEY = 'hub.mes-taches.vue';

type Drawer = { projectId: string; taskId: string; extension: boolean };

// Vue préférée : confort de cet appareil seulement. Lue dès le premier rendu
// (le squelette de chargement n'en dépend pas).
function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'projet' ? 'projet' : 'urgence';
  } catch {
    return 'urgence'; // stockage indisponible (ou rendu côté serveur)
  }
}

// « Mes tâches » (revue Salarié, 19/10/2026 ; logique et mots revus le
// 23/10/2026) : la réponse à « qu'est-ce que je dois faire aujourd'hui ? ».
// Vue par urgence : en retard (du plus ancien), à reprendre, cette semaine,
// en validation. Une mention non lue s'affiche sur la ligne de sa tâche. Une
// tâche s'ouvre en panneau latéral (celui de Projets) ; un fichier glissé sur
// sa ligne prépare son dépôt. Vue par urgence ou par projet.
export function MyTasks({ slug }: { slug: string }) {
  // Titre vide : le salut tient lieu de titre (la barre latérale situe déjà
  // la page).
  useTitrePage('');
  const { utilisateur } = useSessionCourante();
  const base = `/admin/${slug}`;
  const today = useMemo(() => todayIso(), []);
  const tasks = useMyTasks(slug);
  const { data, mentions } = tasks;
  // ?filtre= : lien d'une tuile de Projets (« Mes tâches en retard »…).
  const requested = useSearchParams().get('filtre');
  const [chosenFilter, setFilter] = useState<Filter | null>(
    FILTERS.some((f) => f.key === requested) ? (requested as Filter) : null,
  );
  const [view, setView] = useState<View>(storedView);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [toSubmit, setToSubmit] = useState<{ task: MyTask; pieces?: { nom: string; url: string }[] } | null>(null);
  const fileInFlight = useFileDrag();
  useTaskShortcuts();

  // Après le chargement : l'en-tête des cartes n'existe pas sous le squelette.
  useEnteteFixe(!!data);
  // Grand écran : colonne de droite « Chez mon N+1 » + mentions.
  const large = useMediaQuery('(min-width: 1400px)');

  function chooseView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* idem */
    }
  }

  const g = useMemo(() => groupTasks(data?.taches ?? [], today, tasks.sending), [data, today, tasks.sending]);

  const unread = mentions.filter((m) => !m.lue).length;
  const counts: Record<Filter, number> = {
    retards: g.retards.length,
    reprises: g.reprises.length,
    semaine: g.semaine.length,
    attente: g.attente.length,
    mentions: unread,
  };
  const available = (f: Filter) => (f === 'mentions' ? mentions.length > 0 : counts[f] > 0);
  // Un filtre dont la liste s'est vidée (dernière tâche remise) rend « tout ».
  const filter = chosenFilter && available(chosenFilter) ? chosenFilter : null;

  if (!data) {
    return tasks.error ? (
      <EmptyState>{tasks.error}</EmptyState>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <Skeleton />
      </div>
    );
  }

  const toDecide = tasks.toDecide.taches + tasks.toDecide.absences;
  // Colonne de droite : vue par urgence sans filtre, sur grand écran. Les
  // tâches en validation et les mentions sans tâche y passent (la liste
  // principale ne garde que ce qui demande une action).
  const withAside = large && view === 'urgence' && !filter;
  const open = (t: { projetId: string; id: string }, extension = false) =>
    setDrawer({ projectId: t.projetId, taskId: t.id, extension });

  // Fichiers glissés sur une ligne : lus puis remis via la fenêtre habituelle.
  async function dropFiles(t: MyTask, files: FileList) {
    tasks.setError(null);
    try {
      const read = await Promise.all([...files].slice(0, MAX_FILES).map((f) => lireFichier(f)));
      setToSubmit({ task: t, pieces: read.map(({ nom, url }) => ({ nom, url })) });
    } catch (e) {
      tasks.setError(e instanceof Error ? e.message : 'Lecture du fichier impossible.');
    }
  }

  // Tâches à afficher selon le filtre (cartes) et la vue.
  const selection: MyTask[] = filter === 'mentions' ? [] : filter ? g[filter] : g.open;
  // Lignes réellement affichées (« Plus tard » est replié) : une mention non
  // lue s'y accroche ; les autres restent dans la section Mentions.
  const shown = new Set(
    (view === 'projet' || filter
      ? selection
      : SECTIONS.filter((s) => !(withAside && s === 'attente')).flatMap((s) => g.sections[s])
    ).map((t) => t.id),
  );
  const mentionsByTask = new Map<string, MentionRecue[]>();
  if (filter !== 'mentions') {
    for (const m of mentions) {
      if (m.lue || !m.tacheId || !shown.has(m.tacheId)) continue;
      mentionsByTask.set(m.tacheId, [...(mentionsByTask.get(m.tacheId) ?? []), m]);
    }
  }
  const looseMentions = mentions
    .filter((m) => !(m.tacheId && mentionsByTask.has(m.tacheId)))
    .map((m) => (
      <MentionRow
        key={m.id}
        slug={slug}
        m={m}
        onOpen={() => (m.tacheId ? open({ projetId: m.projetId, id: m.tacheId }) : undefined)}
        base={base}
        onChange={() => void tasks.reloadMentions()}
      />
    ));

  // Pastille de mention : ouvre la tâche (le fil est dans le panneau) et
  // marque ses mentions comme lues.
  function openMentions(t: MyTask, list: MentionRecue[]) {
    open(t);
    void Promise.all(list.map((m) => marquerMentionLue(slug, m.id)))
      .then(() => tasks.reloadMentions())
      .catch(() => undefined);
  }

  const renderTask = (t: MyTask, withoutProject = false) => (
    <TaskRow
      key={t.id}
      t={t}
      tone={g.toneOf(t)}
      late={g.late.has(t)}
      base={base}
      today={today}
      withoutProject={withoutProject}
      mentions={mentionsByTask.get(t.id)}
      onMentions={(list) => openMentions(t, list)}
      onOpen={(extension) => open(t, extension)}
      onSubmit={t.statut === 'remise' || t.statut === 'bloquee' ? undefined : () => setToSubmit({ task: t })}
      onFiles={t.statut === 'remise' ? undefined : (f) => void dropFiles(t, f)}
      fileInFlight={fileInFlight}
    />
  );

  return (
    <div className="mt-page page-entete-fixe">
      <MyTasksHeader
        firstName={prenomAffiche(utilisateur)}
        today={today}
        urgent={g.urgent}
        unread={unread}
        view={view}
        onView={chooseView}
        counts={counts}
        filter={filter}
        available={available}
        sunday={g.sunday}
        onFilter={(f) => setFilter((x) => (x === f ? null : f))}
      />

      {tasks.error && <FieldError>{tasks.error}</FieldError>}

      {toDecide > 0 && !filter && (
        <div className="mt-bandeau">
          <p>
            <strong>Vous êtes N+1.</strong>{' '}
            {[
              tasks.toDecide.taches &&
                `${plural(tasks.toDecide.taches, 'tâche')} remise${tasks.toDecide.taches > 1 ? 's' : ''}`,
              tasks.toDecide.absences && `${plural(tasks.toDecide.absences, 'demande')} d’absence`,
            ]
              .filter(Boolean)
              .join(' et ')}{' '}
            attend{toDecide > 1 ? 'ent' : ''} votre décision.
          </p>
          <Link className="btn-primary btn-primary--sm" href={`${base}/mon-espace?onglet=a-valider`}>
            Décider
          </Link>
        </div>
      )}

      <div className="mt-colonnes" data-cote={withAside || undefined}>
        <TaskList
          groups={g}
          view={view}
          filter={filter}
          filterCount={filter === 'mentions' ? mentions.length : filter ? counts[filter] : 0}
          withAside={withAside}
          selection={selection}
          looseMentions={looseMentions}
          renderTask={renderTask}
          onShowAll={() => setFilter(null)}
        />
        {withAside && (
          <ReviewerAside
            waiting={g.attente}
            reminders={tasks.reminders}
            today={today}
            mentions={looseMentions}
            onOpen={(t) => open(t)}
            onRemind={(t) => void tasks.remind(t)}
          />
        )}
      </div>

      {/* Glisser-déposer et raccourcis clavier : dans l'aide « ? » (fiche
          Mes tâches) ; ici, seulement le lien vers l'historique. */}
      <p className="dmd-note mt-pied">
        Historique et respect des délais :{' '}
        <Link className="lien-inline" href={`${base}/mon-espace?onglet=performances`}>
          Mon espace › Mes performances
        </Link>
        .
      </p>

      {toSubmit && (
        <SubmissionModal
          slug={slug}
          task={toSubmit.task}
          initialFiles={toSubmit.pieces}
          onSend={(body) => tasks.submitLater(toSubmit.task, body)}
          onClose={() => setToSubmit(null)}
        />
      )}
      {fileInFlight && <p className="mt-depot-aide">Lâchez le fichier sur la tâche à déposer</p>}
      {tasks.toast && (
        <DepositToast
          key={tasks.toast.id}
          libelle={tasks.toast.libelle}
          onCancel={() => tasks.cancelSubmission(tasks.toast!.id)}
        />
      )}
      {drawer && (
        <TaskDrawer
          key={`${drawer.taskId}:${drawer.extension}`}
          slug={slug}
          projectId={drawer.projectId}
          taskId={drawer.taskId}
          meId={utilisateur.id}
          extension={drawer.extension}
          onChange={() => {
            void tasks.reloadTasks();
            void tasks.reloadMentions();
          }}
          onClose={() => setDrawer(null)}
          onNeighbour={(step) => {
            // Ordre affiché dans la liste (sections, vue, filtre) : celui de J / K.
            const ids = [...document.querySelectorAll<HTMLElement>('.mt-liste .mt-ligne[data-tache]')].map(
              (el) => el.dataset.tache!,
            );
            const next = ids[ids.indexOf(drawer.taskId) + step];
            const t = next && data.taches.find((x) => x.id === next);
            if (t) open(t);
          }}
        />
      )}
    </div>
  );
}
