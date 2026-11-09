'use client';

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { plural } from '@hub/domain';
import { Skeleton } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';
import { countProjects, hasNoTeam, visibleProjects, type ProjectFilter } from './project-picker-model';
import type { OpenProjectSummary, OpenProjectsBoard } from './types';

type Props = {
  board: OpenProjectsBoard | null;
  projectId: string | null;
  onSelect: (id: string) => void;
  // Filtre et compteur « Sans équipe » : pour qui affecte ou suit les
  // équipes, pas pour le Salarié (il ne voit que les projets de son équipe).
  showTeams: boolean;
};

// Marge sous la liste (desktop) : elle s'arrête avant le bas de la fenêtre.
const BOTTOM_GAP_PX = 32;

// Hauteur disponible sous le bouton, jusqu'au bas de la fenêtre.
function availableHeight(el: HTMLElement | null): number | null {
  if (!el) return null;
  return Math.max(240, window.innerHeight - el.getBoundingClientRect().bottom - BOTTOM_GAP_PX);
}

// État d'un projet : livraison dépassée, retards, ou dans les délais.
function ProjectHealth({ project: p }: { project: OpenProjectSummary }) {
  return (
    <Pill className={`pill--${p.livraisonDepassee || p.enRetard ? 'risque' : 'succes'}`}>
      {p.livraisonDepassee ? 'Livraison dépassée' : p.enRetard ? `${p.enRetard} en retard` : 'Dans les délais'}
    </Pill>
  );
}

// Sélecteur des projets ouverts (09/11/2026) : un seul bouton, quel que soit
// le nombre de projets — le dossier garde toute la largeur. Au clic, une
// liste avec recherche (code, client), filtres rapides et tri par urgence ;
// flèches, Entrée et Échap au clavier ; plein écran sur téléphone.
export function ProjectPicker({ board, projectId, onSelect, showTeams }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [active, setActive] = useState(0);
  // Hauteur disponible sous le bouton (desktop), mesurée à l'ouverture.
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const projects = useMemo(() => board?.projets ?? [], [board]);
  const counts = useMemo(() => countProjects(projects), [projects]);
  const shown = useMemo(() => visibleProjects(projects, filter, query), [projects, filter, query]);
  const current = projects.find((p) => p.id === projectId) ?? null;
  // Borné : la liste peut changer pendant que le panneau est ouvert.
  const activeIndex = Math.min(active, shown.length - 1);
  const activeProject = activeIndex >= 0 ? shown[activeIndex] : null;
  const optionId = (p: OpenProjectSummary) => `${listId}-${p.id}`;

  // Un clic hors du sélecteur le referme.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Fenêtre redimensionnée pendant que la liste est ouverte : nouvelle hauteur.
  useEffect(() => {
    if (!open) return;
    const onResize = () => setMaxHeight(availableHeight(trigger.current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  // L'option active (flèches) reste visible dans la liste.
  useEffect(() => {
    if (open && activeProject)
      document.getElementById(`${listId}-${activeProject.id}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeProject, listId]);

  function openPanel() {
    setMaxHeight(availableHeight(trigger.current));
    setQuery('');
    setFilter('all');
    setActive(0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(p: OpenProjectSummary) {
    onSelect(p.id);
    close();
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown.length)
        setActive((e.key === 'ArrowDown' ? activeIndex + 1 : activeIndex + shown.length - 1) % shown.length);
    } else if (e.key === 'Enter' && activeProject) {
      e.preventDefault();
      choose(activeProject);
    }
  }

  if (!board) return <Skeleton />;

  const filters: { id: ProjectFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Tous', count: counts.total },
    { id: 'late', label: 'En retard', count: counts.late },
    ...(showTeams ? [{ id: 'noTeam' as const, label: 'Sans équipe', count: counts.noTeam }] : []),
  ];
  const emptyLabel =
    filter === 'late' ? 'Aucun projet en retard' : filter === 'noTeam' ? 'Tous les projets ont une équipe' : '';

  return (
    <div
      className={`pp${open ? ' is-ouvert' : ''}`}
      ref={root}
      // Échap referme, où que soit le focus dans le sélecteur.
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
      // Le focus qui quitte le sélecteur (Tab) le referme.
      onBlur={(e) => {
        if (open && e.relatedTarget && !root.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <div className="pp-ligne">
        <button
          ref={trigger}
          type="button"
          className="pp-declencheur"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? close() : openPanel())}
        >
          <span className="pp-declencheur-titre">Projet</span>
          {current ? (
            <>
              <span className="po-code">{current.code}</span>
              <span className="pp-client">{current.client}</span>
              <ProjectHealth project={current} />
              {showTeams && hasNoTeam(current) && <Pill tone="attention">Sans équipe</Pill>}
            </>
          ) : (
            <span className="pp-client">Choisir un projet</span>
          )}
          <ChevronDown size={16} aria-hidden className="pp-chevron" />
        </button>
        <p className="pp-resume">
          {plural(counts.total, 'projet')} ouvert{counts.total > 1 ? 's' : ''}
          {counts.late > 0 && ` · ${counts.late} en retard`}
          {showTeams && counts.noTeam > 0 && ` · ${counts.noTeam} sans équipe`}
        </p>
      </div>

      {open && (
        <div
          className="pp-panneau"
          role="dialog"
          aria-label="Choisir un projet"
          style={maxHeight ? ({ '--pp-max': `${maxHeight}px` } as CSSProperties) : undefined}
        >
          <div className="pp-recherche">
            <Search size={16} aria-hidden />
            <input
              className="field-input"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeProject ? optionId(activeProject) : undefined}
              aria-label="Rechercher un projet"
              autoComplete="off"
              autoFocus
              placeholder="Rechercher un code ou un client…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
            />
            <button type="button" className="pp-fermer" aria-label="Fermer" onClick={close}>
              <X size={18} aria-hidden />
            </button>
          </div>

          <div className="pp-filtres" role="group" aria-label="Filtrer les projets">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                className={`pp-filtre${filter === f.id ? ' is-actif' : ''}`}
                // Le focus reste dans la recherche (flèches, Entrée, Échap).
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setFilter(f.id);
                  setActive(0);
                }}
              >
                {f.label} <span className="pp-filtre-nombre">{f.count}</span>
              </button>
            ))}
          </div>

          <p className="pp-compte" aria-live="polite">
            {shown.length === 0
              ? query.trim()
                ? `Aucun projet pour « ${query.trim()} »`
                : emptyLabel
              : `${plural(shown.length, 'projet')} · les plus urgents d’abord`}
          </p>

          <ul className="pp-liste" id={listId} role="listbox" aria-label="Projets ouverts">
            {shown.map((p, i) => (
              <li
                key={p.id}
                id={optionId(p)}
                role="option"
                aria-selected={p.id === projectId}
                className={`pp-option${i === activeIndex ? ' is-actif' : ''}${p.id === projectId ? ' is-choisi' : ''}`}
                onMouseEnter={() => setActive(i)}
                // Choisi avant que la recherche ne perde le focus (bouton principal seulement).
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  choose(p);
                }}
              >
                <span className="pp-option-tete">
                  <span className="po-code">{p.code}</span>
                  <span className="pp-client">{p.client}</span>
                  {p.id === projectId && <Check size={14} aria-hidden className="pp-coche" />}
                  <ProjectHealth project={p} />
                </span>
                <span className="pp-option-pied">
                  {p.cellule ? (
                    <span className="pp-equipe">{p.cellule}</span>
                  ) : (
                    showTeams && <Pill tone="attention">Sans équipe</Pill>
                  )}
                  <span>
                    J{p.jour} / {p.horizon}
                  </span>
                  <span>
                    {p.faites}/{p.total} tâches
                  </span>
                  <span className="po-barre pp-avance" aria-hidden>
                    <span style={{ width: `${p.total ? Math.round((p.faites / p.total) * 100) : 0}%` }} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
