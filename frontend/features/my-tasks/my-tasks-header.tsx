'use client';

import { Check } from 'lucide-react';
import { formatDayMonth, plural } from '@hub/domain';
import { EMPTY_LABELS, FILTERS, type Filter } from './task-groups';

export type View = 'urgence' | 'projet';

// Salut + résumé (pas de second titre « Mes tâches »), choix de la vue, puis
// les cartes-filtres en en-tête fixe : un filtre n'affiche que sa liste.
export function MyTasksHeader({
  firstName,
  today,
  urgent,
  unread,
  view,
  onView,
  counts,
  filter,
  available,
  sunday,
  onFilter,
}: {
  firstName: string;
  today: string;
  urgent: number;
  unread: number;
  view: View;
  onView: (v: View) => void;
  counts: Record<Filter, number>;
  filter: Filter | null;
  available: (f: Filter) => boolean;
  sunday: string;
  onFilter: (f: Filter) => void;
}) {
  return (
    <>
      <div className="mt-accueil">
        <div>
          <h1 className="mt-accueil-titre">
            {/* Heure de l'appareil, exception voulue au fuseau de Dakar (glossaire). */}
            {new Date().getHours() >= 18 ? 'Bonsoir' : 'Bonjour'} {firstName}
          </h1>
          <p className="mt-accueil-sous">
            <span className="mt-accueil-date">
              {new Date(`${today}T12:00:00Z`).toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              })}
              {' · '}
            </span>
            {urgent === 0
              ? 'rien d’urgent aujourd’hui'
              : `${urgent} tâche${urgent > 1 ? 's demandent' : ' demande'} votre attention`}
            {unread > 0 && `, ${plural(unread, 'mention')} à lire`}
          </p>
        </div>
        <div className="vue-toggle" role="group" aria-label="Présentation">
          {(['urgence', 'projet'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={view === v ? 'is-active' : ''}
              aria-pressed={view === v}
              onClick={() => onView(v)}
            >
              <span className="mt-long">{v === 'urgence' ? 'Par urgence' : 'Par projet'}</span>
              <span className="mt-court" aria-hidden>
                {v === 'urgence' ? 'Urgence' : 'Projet'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-entete entete-fixe">
        <div className="mt-filtres" role="group" aria-label="Filtrer mes tâches">
          {FILTERS.map((f) => {
            const n = counts[f.key];
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                className={`mt-filtre${active ? ' is-actif' : ''}${n === 0 ? ' is-vide' : ''}`}
                data-ton={n > 0 ? f.tone : 'succes'}
                aria-pressed={active}
                disabled={!available(f.key)}
                onClick={() => onFilter(f.key)}
              >
                <span className="mt-filtre-icone" aria-hidden>
                  <f.icon size={16} />
                </span>
                <span className="mt-filtre-texte">
                  <span className="mt-filtre-libelle">{f.label}</span>
                  <span className="mt-filtre-aide">
                    {n === 0
                      ? EMPTY_LABELS[f.key]
                      : f.key === 'semaine'
                        ? `d’ici le ${formatDayMonth(sunday)}`
                        : f.hint}
                  </span>
                </span>
                <span className="mt-filtre-compte">
                  {n === 0 ? <Check size={20} strokeWidth={2.5} aria-label="0" /> : n}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
