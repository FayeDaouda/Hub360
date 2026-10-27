'use client';

import { useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { Pill } from '@/components/ui/pill';
import { formatDayMonth, plural, stripAccents } from '@hub/domain';
import { cardPill, HOURS_PER_DAY, taskHoursLabel, taskPill } from './labels';
import { SiteVisitDate, type SiteVisitProps } from './site-fields';
import type { ProjectCard } from './types';

// Carte du gabarit dont les relevés sont dus 24 h après la visite sur site.
export const SURVEY_CARD_KEY = 'releves_existants';

type Props = {
  card: ProjectCard;
  taskId: string | null;
  threadActive: boolean;
  onTask: (id: string) => void;
  onThread: () => void;
  visit?: SiteVisitProps;
};

// Clé technique (« laterale_droite ») qui ne fait que répéter le libellé.
const normalize = (x: string) =>
  stripAccents(x)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const sameAsLabel = (key: string, label: string) => normalize(key) === normalize(label);

// Carte d'une étape : fenêtre, étiquettes, tâches (assigné, temps, échéance,
// état, messages) et bouton du fil de la carte.
export function ProjectCardView({ card: c, taskId, threadActive, onTask, onThread, visit }: Props) {
  const pill = cardPill(c.etat);
  // Carte close (tout validé) : repliée sur une ligne, dépliable au clic.
  const collapsible = c.etat.code === 'close';
  const [expanded, setExpanded] = useState(!collapsible);
  if (collapsible && !expanded) {
    return (
      <article className="po-carte po-carte--repliee">
        <button type="button" className="po-carte-deplier" aria-expanded={false} onClick={() => setExpanded(true)}>
          <span className="po-carte-repliee-titre">
            <ChevronDown size={16} aria-hidden className="po-chevron" />
            {c.libelle}
          </span>
          <span className="po-carte-repliee-droite">
            <span className="po-aide">{plural(c.taches.length, 'tâche')}</span>
            <Pill tone={pill.ton}>{pill.libelle}</Pill>
          </span>
        </button>
      </article>
    );
  }
  const disabled = c.etat.code === 'desactivee';
  // « délai en heures ouvrées depuis J1 » : la fenêtre se lit aussi en heures.
  const inHours = c.note?.includes('heures ouvrées') && c.debutJ !== null && c.finJ !== null;
  const timeWindow =
    c.debutJ !== null && c.debutLe && c.finLe
      ? `J${c.debutJ} → J${c.finJ} · ${formatDayMonth(c.debutLe)} → ${formatDayMonth(c.finLe)}${inHours ? ` · ${(c.finJ! - c.debutJ + 1) * HOURS_PER_DAY} h ouvrées` : ''}`
      : (c.note?.split(' : ')[0] ?? null);
  const tags = [c.etiquette, c.client ? 'CLIENT · hors budget atelier' : null].filter((x): x is string => !!x);

  return (
    <article className={`po-carte${disabled ? ' is-eteinte' : ''}`}>
      <header className="po-carte-tete">
        <div>
          <p className="po-kicker po-kicker--code">{c.cle.toUpperCase()}</p>
          <h3>{c.libelle}</h3>
        </div>
        <div className="po-carte-droite">
          {collapsible && (
            <button
              type="button"
              className="po-carte-replier"
              aria-expanded
              onClick={() => setExpanded(false)}
              aria-label={`Replier ${c.libelle}`}
            >
              <ChevronDown size={16} aria-hidden />
            </button>
          )}
          <Pill tone={pill.ton}>{pill.libelle}</Pill>
          {timeWindow && <span className="po-aide">{timeWindow}</span>}
          {tags.map((e) => (
            <Pill key={e} tone="neutre">
              {e}
            </Pill>
          ))}
        </div>
      </header>
      {c.descriptif && <p className="po-aide po-carte-descriptif">{c.descriptif}</p>}
      {visit && <SiteVisitDate {...visit} />}
      {c.etat.code === 'verrouillee' && (
        <p className="po-attente">S’ouvre quand ces tâches sont validées : {c.etat.attend.join(', ')}.</p>
      )}
      {c.fichiers ? (
        <p className="po-aide">Aucun fichier source déposé dans cette étape.</p>
      ) : c.taches.length === 0 ? (
        <p className="po-aide">Aucune tâche générée pour ce projet.</p>
      ) : (
        <ul className="po-taches">
          {c.taches.map((t) => {
            const pt = taskPill(t.etat);
            const off = t.etat.code === 'non_necessaire' || t.etat.code === 'desactivee';
            const keyShown = !sameAsLabel(t.cle, t.libelle);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={`po-tache${t.id === taskId ? ' is-actif' : ''}${off ? ' is-eteinte' : ''}`}
                  aria-pressed={t.id === taskId}
                  onClick={() => onTask(t.id)}
                >
                  <span className="po-tache-libelle">
                    <strong>{t.libelle}</strong>
                    {(keyShown || t.motif) && (
                      <span className="po-aide">
                        {[keyShown && t.cle.replace(/_/g, ' '), t.motif].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="po-tache-assigne">{t.assigne?.nom ?? 'À assigner'}</span>
                  <span className="po-tache-heures">{taskHoursLabel(t)}</span>
                  <span className={`po-tache-echeance${t.etat.code === 'en_retard' ? ' po-retard' : ''}`}>
                    {t.finLe ? formatDayMonth(t.finLe) : '—'}
                  </span>
                  <span className="po-tache-etat">
                    <Pill tone={pt.ton}>{pt.libelle}</Pill>
                    {t.fil > 0 && (
                      <span className="po-tache-fil" aria-label={`${t.fil} message(s)`}>
                        <MessageCircle size={13} aria-hidden /> {t.fil}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className={`po-fil-bouton${threadActive ? ' is-actif' : ''}`}
        aria-pressed={threadActive}
        onClick={onThread}
      >
        Fil de la carte · {c.fil}
      </button>
    </article>
  );
}
