'use client';

import type { ReactNode } from 'react';
import { BellRing, Check } from 'lucide-react';
import { waitingSince } from './task-groups';
import type { MyTask } from './types';
import type { Reminder } from './use-my-tasks';
import { transitionStyle } from './view-transition';

// Colonne de droite (grand écran, vue par urgence sans filtre) : les tâches
// chez le N+1, avec leur relance, et les mentions sans tâche affichée.
export function ReviewerAside({
  waiting,
  reminders,
  today,
  mentions,
  onOpen,
  onRemind,
}: {
  waiting: MyTask[];
  reminders: Record<string, Reminder>;
  today: string;
  // Lignes de mention déjà rendues (rien quand il n'y en a pas).
  mentions: ReactNode[];
  onOpen: (t: MyTask) => void;
  onRemind: (t: MyTask) => void;
}) {
  return (
    <aside className="mt-cote" aria-label="En attente de validation et mentions">
      <section className="panel glass-panel mt-cote-bloc">
        <h2 className="mt-groupe-titre" data-ton="info">
          Chez mon N+1
        </h2>
        {waiting.length === 0 ? (
          <p className="mt-cote-vide">Aucune tâche en attente de validation.</p>
        ) : (
          <ul className="mt-cote-liste">
            {waiting.map((t) => {
              const reminder = reminders[t.id];
              const canRemind = !!t.relancePossibleLe && t.relancePossibleLe <= today && reminder !== 'ok';
              return (
                <li key={t.id} className="mt-cote-item">
                  <button
                    type="button"
                    className="mt-cote-tache"
                    style={transitionStyle(t.id)}
                    onClick={() => onOpen(t)}
                  >
                    <span className="mt-cote-titre">{t.libelle}</span>
                    <span className="mt-cote-meta">
                      v{String(t.version).padStart(2, '0')} ·{' '}
                      {t.remisLe ? waitingSince(t.remisLe, today) : 'en validation'}
                    </span>
                    <span className="mt-cote-meta">chez {t.validateur ?? 'un validateur à désigner'}</span>
                  </button>
                  {reminder === 'ok' ? (
                    <span className="mt-cote-relance-ok" role="status">
                      <Check size={14} aria-hidden /> Relance envoyée
                    </span>
                  ) : (
                    canRemind && (
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm mt-cote-relancer"
                        disabled={reminder === 'envoi'}
                        onClick={() => onRemind(t)}
                      >
                        <BellRing size={14} aria-hidden /> {reminder === 'envoi' ? 'Envoi…' : 'Relancer'}
                      </button>
                    )
                  )}
                  {reminder && typeof reminder === 'object' && <span className="field-erreur">{reminder.erreur}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {mentions.length > 0 && (
        <section className="panel glass-panel mt-cote-bloc">
          <h2 className="mt-groupe-titre" data-ton="iris">
            Mentions
          </h2>
          <ul className="mt-lignes">{mentions}</ul>
        </section>
      )}
    </aside>
  );
}
