'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { formatDate, plural } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { useEnteteFixe } from '@/lib/entete-fixe';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { getAbsencesAValider } from '@/lib/demandes';
import { getNonLuesParType, marquerTypesLus } from '@/lib/notifications';
import { LIBELLE_CONTRAT } from '@/lib/rh';
import type { NotificationType } from '@/lib/types';
import { getTasksToReview } from '@/features/my-tasks/api';
import { PersonAvatar } from '@/components/ui/avatar';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { getMySpace } from './api';
import { MyDocuments } from './documents';
import { HealthRefunds } from './health-refunds';
import { LeaveRequests } from './leave-requests';
import { MissionCard } from './mission-card';
import { MyCell } from './my-cell';
import {
  AWAITING_TEAM,
  TAB_GROUPS,
  TAB_NEWS,
  TABS,
  visibleTabs,
  WITHOUT_TASKS,
  type Tab,
  type TabGroup,
} from './my-space-tabs';
import { MyTime } from './my-time';
import { MyPerformance } from './performance';
import { PersonalInfo } from './personal-info';
import { ToReview } from './to-review';
import type { MyFile } from './types';

// « Mon espace » (RH lot 5) : l'espace personnel de chaque compte, direction
// comprise, monté dans le back-office comme dans l'espace collaborateur.
// L'onglet vit dans l'URL (?onglet=) pour les liens directs.
export function MySpace({ slug }: { slug: string }) {
  const { utilisateur, role } = useSessionCourante();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get('onglet');
  const requestedTab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : TABS[0].key;

  // undefined : en chargement ; null : aucun dossier du personnel relié au compte.
  const [file, setFile] = useState<MyFile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const tabBar = useRef<HTMLDivElement>(null);
  // Tâches remises + absences en attente de ma décision (N+1) : compteur de
  // l'onglet « À valider » (toujours affiché, maquette du boss).
  const [toReview, setToReview] = useState(0);
  const count = useCallback((n: number) => setToReview(n), []);
  const [unread, setUnread] = useState<Partial<Record<NotificationType, number>>>({});
  const news = (t: Tab) => (TAB_NEWS[t] ?? []).reduce((n, type) => n + (unread[type] ?? 0), 0);

  // Titre (maquette) : « Mon espace · Prénom Nom » — celui du dossier RH, sinon du compte.
  const displayName = file ? `${file.prenom} ${file.nom}`.trim() : `${utilisateur.prenom} ${utilisateur.nom}`.trim();
  useTitrePage(file === undefined ? 'Mon espace' : `Mon espace · ${displayName}`);
  useEnteteFixe();

  useEffect(() => {
    getMySpace(slug)
      .then((r) => setFile(r.dossier))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Impossible de charger votre espace.'));
    Promise.all([getTasksToReview(slug), getAbsencesAValider(slug)])
      .then(([t, a]) => setToReview(t.length + a.length))
      .catch(() => setToReview(0));
    getNonLuesParType(slug)
      .then(setUnread)
      .catch(() => setUnread({}));
  }, [slug]);

  // Onglet ouvert : ses nouveautés sont vues (cloche comprise). Ses pastilles
  // ne s'affichent que hors de l'onglet : remises à zéro après l'envoi.
  useEffect(() => {
    const types = (TAB_NEWS[requestedTab] ?? []).filter((t) => (unread[t] ?? 0) > 0);
    if (!types.length) return;
    marquerTypesLus(slug, types)
      .catch(() => undefined)
      .then(() => setUnread((x) => ({ ...x, ...Object.fromEntries(types.map((t) => [t, 0])) })));
  }, [slug, requestedTab, unread]);

  // Barre d'onglets défilante sur mobile : l'onglet actif reste visible.
  useEffect(() => {
    tabBar.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [requestedTab, file]);

  if (error) return <EmptyState>{error}</EmptyState>;
  if (file === undefined) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <Skeleton />
      </div>
    );
  }

  const visible = visibleTabs(role, !!file?.mission, toReview);
  const tab: Tab = visible.some((t) => t.key === requestedTab) ? requestedTab : visible[0].key;
  const current = TABS.find((t) => t.key === tab)!;
  const groups = TAB_GROUPS.filter((g) => visible.some((t) => t.group === g.key));
  const groupTabs = visible.filter((t) => t.group === current.group);
  // Sans dossier RH : le nom du compte connecté.
  const firstName = file?.prenom ?? utilisateur.prenom;
  const lastName = file?.nom ?? utilisateur.nom;
  const choose = (key: Tab) => router.replace(`${pathname}?onglet=${key}`, { scroll: false });
  const groupNews = (g: TabGroup) =>
    visible.filter((t) => t.group === g).reduce((n, t) => n + (t.key === 'a-valider' ? toReview : news(t.key)), 0);
  const chooseGroup = (g: TabGroup) => g !== current.group && choose(visible.find((t) => t.group === g)!.key);

  return (
    <div className="mes-page page-entete-fixe">
      <div className="mes-entete">
        <PersonAvatar name={`${firstName} ${lastName}`} photo={file?.photo ?? null} size="lg" />
        <p className="mes-sous-titre">
          {file
            ? [
                file.poste,
                file.societe,
                file.cellule ?? (WITHOUT_TASKS.has(role) ? null : 'sans cellule'),
                `${LIBELLE_CONTRAT[file.typeContrat]}${file.dateEntree ? ` depuis le ${formatDate(file.dateEntree)}` : ''}`,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'Aucun dossier du personnel relié à ce compte'}
        </p>
      </div>

      {/* En-tête fixe : blocs et onglets sur une ligne, au-dessus du contenu qui défile. */}
      <div className="entete-fixe mes-navigation">
        {groups.length > 1 && (
          <div className="vue-toggle mes-blocs" role="tablist" aria-label="Mon espace">
            {groups.map((g) => (
              <button
                key={g.key}
                type="button"
                role="tab"
                aria-selected={current.group === g.key}
                className={current.group === g.key ? 'is-active' : ''}
                onClick={() => chooseGroup(g.key)}
              >
                {g.label}
                {/* Nouveautés (et décisions en attente) de l'autre bloc : visibles d'ici. */}
                {current.group !== g.key && <NewsBadge n={groupNews(g.key)} />}
              </button>
            ))}
          </div>
        )}

        <div ref={tabBar} className="vue-toggle rh-onglets" role="tablist" aria-label="Rubrique de Mon espace">
          {groupTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? 'is-active' : ''}
              onClick={() => choose(t.key)}
            >
              {t.key === 'a-valider' ? `${t.label} · ${toReview}` : t.label}
              {t.key !== tab && <NewsBadge n={news(t.key)} />}
            </button>
          ))}
        </div>
      </div>

      {file && !file.cellule && AWAITING_TEAM.has(role) && (
        <p className="mes-bandeau" role="status">
          Votre dossier est créé par la RH. Vous n’êtes pas encore affecté à une équipe : votre responsable de société
          le fera depuis la rubrique Équipes. Vos performances apparaîtront dès votre premier livrable assigné.
        </p>
      )}

      {current.needsFile && !file ? (
        <EmptyState>
          Aucun dossier du personnel n’est relié à votre compte : la RH doit l’ouvrir (ou le relier) avant que cette
          rubrique soit disponible.
        </EmptyState>
      ) : tab === 'performances' ? (
        <MyPerformance slug={slug} />
      ) : tab === 'mission' ? (
        <MissionCard mission={file!.mission!} />
      ) : tab === 'a-valider' ? (
        <ToReview slug={slug} onCount={count} />
      ) : tab === 'temps' ? (
        <MyTime slug={slug} />
      ) : tab === 'cellule' ? (
        <MyCell slug={slug} />
      ) : tab === 'conges' ? (
        <LeaveRequests slug={slug} />
      ) : tab === 'remboursements' ? (
        <HealthRefunds slug={slug} />
      ) : tab === 'informations' ? (
        <PersonalInfo slug={slug} file={file!} onChange={setFile} />
      ) : (
        <MyDocuments slug={slug} file={file!} onChange={setFile} />
      )}
    </div>
  );
}

function NewsBadge({ n }: { n: number }) {
  return n > 0 ? (
    <span className="mes-pastille" aria-label={`${plural(n, 'nouveauté')}`}>
      {n}
    </span>
  ) : null;
}
