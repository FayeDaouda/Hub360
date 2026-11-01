'use client';

import { useState } from 'react';
import { Check, ChevronDown, Minus, MessageCircle, Pencil, Plus, Trash2, UserRound, UsersRound } from 'lucide-react';
import { Pill } from '@/components/ui/pill';
import { formatDayMonth, plural, stripAccents } from '@hub/domain';
import { blockAssignment, cardPill, HOURS_PER_DAY, taskHoursLabel, taskPill } from './labels';
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
  // Bouton « Assigner le bloc » : ouvre la fenêtre de choix (Dir. GC, chef
  // d'équipe) ; absent = lecture (qui a le bloc, sans bouton).
  onAssignBlock?: () => void;
  // Toutes les tâches du bloc, quand « Seulement mes tâches » en masque.
  blockTasks?: ProjectCard['taches'];
  // Personnalisation du projet (01/11/2026) : présente = mode personnalisation.
  customize?: {
    onAdd: () => void;
    onEdit: (t: ProjectCard['taches'][number]) => void;
    onRemove: (t: ProjectCard['taches'][number]) => void;
  };
};

// Coche d'une ligne (01/11/2026) : accomplie = validée (visa compris) ;
// « non nécessaire » compte comme faite, en gris.
type Done = 'faite' | 'sans_objet' | null;
const doneOf = (t: ProjectCard['taches'][number]): Done =>
  t.etat.code === 'validee' ? 'faite' : t.etat.code === 'non_necessaire' ? 'sans_objet' : null;
function Coche({ done }: { done: Done }) {
  return (
    <span
      className={`po-coche${done ? ` po-coche--${done}` : ''}`}
      role="img"
      aria-label={done === 'faite' ? 'Accomplie' : done === 'sans_objet' ? 'Non nécessaire' : 'Pas encore accomplie'}
    >
      {done === 'faite' ? (
        <Check size={13} strokeWidth={3} aria-hidden />
      ) : done === 'sans_objet' ? (
        <Minus size={13} strokeWidth={3} aria-hidden />
      ) : null}
    </span>
  );
}

// Clé technique (« laterale_droite ») qui ne fait que répéter le libellé.
const normalize = (x: string) =>
  stripAccents(x)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const sameAsLabel = (key: string, label: string) => normalize(key) === normalize(label);

// Carte d'une étape : fenêtre, étiquettes, tâches (assigné, temps, échéance,
// état, messages) et bouton du fil de la carte.
export function ProjectCardView({
  card: c,
  taskId,
  threadActive,
  onTask,
  onThread,
  visit,
  onAssignBlock,
  blockTasks,
  customize,
}: Props) {
  const pill = cardPill(c.etat);
  // Lignes accomplies : validées ou non nécessaires.
  const doneCount = c.taches.filter((t) => doneOf(t)).length;
  // Carte close (tout validé) : repliée sur une ligne, dépliable au clic —
  // sauf en personnalisation.
  const collapsible = c.etat.code === 'close' && !customize;
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
            <span className="po-aide">
              {doneCount} / {plural(c.taches.length, 'tâche')} accomplie{doneCount > 1 ? 's' : ''}
            </span>
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
  // Qui a le bloc (ses tâches encore ouvertes) — rien sur une carte désactivée.
  const block = disabled ? null : blockAssignment(blockTasks ?? c.taches);
  const BlockIcon = block && !block.vide && !block.personneId ? UsersRound : UserRound;

  return (
    <article className={`po-carte${disabled ? ' is-eteinte' : ''}`}>
      <header className="po-carte-tete">
        <div>
          <p className="po-kicker po-kicker--code">{c.cle.toUpperCase()}</p>
          <h3>{c.libelle}</h3>
        </div>
        <div className="po-carte-droite">
          {/* Qui a le bloc : en haut à droite, sur la ligne du titre. */}
          {block &&
            (onAssignBlock ? (
              <button
                type="button"
                className={`po-bloc-assigner${block.vide ? ' is-vide' : ''}`}
                onClick={onAssignBlock}
                title={
                  block.vide
                    ? `Assigner les ${block.ouvertes} tâches ouvertes du bloc`
                    : 'Modifier l’assignation du bloc'
                }
              >
                <BlockIcon size={15} aria-hidden />
                {block.libelle}
              </button>
            ) : (
              !block.vide && (
                <span className="po-bloc-assigne">
                  <BlockIcon size={15} aria-hidden />
                  {block.libelle}
                </span>
              )
            ))}
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
          {c.taches.length > 0 && (
            <span className={`po-compteur${doneCount === c.taches.length ? ' is-complet' : ''}`}>
              <Check size={13} strokeWidth={3} aria-hidden /> {doneCount} / {c.taches.length}
            </span>
          )}
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
            const keyShown = !sameAsLabel(t.cle, t.libelle) && !t.ajouteeAuProjet;
            const done = doneOf(t);
            return (
              <li key={t.id} className={customize ? 'po-tache-perso' : undefined}>
                <button
                  type="button"
                  className={`po-tache${t.id === taskId ? ' is-actif' : ''}${off ? ' is-eteinte' : ''}`}
                  aria-pressed={t.id === taskId}
                  onClick={() => onTask(t.id)}
                >
                  <span className="po-tache-libelle">
                    <Coche done={done} />
                    <span className="po-tache-titre">
                      <strong className={done ? 'is-faite' : undefined}>{t.libelle}</strong>
                      {(keyShown || t.motif || t.ajouteeAuProjet) && (
                        <span className="po-aide">
                          {[t.ajouteeAuProjet && 'ajoutée au projet', keyShown && t.cle.replace(/_/g, ' '), t.motif]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </span>
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
                {customize && (
                  <span className="po-tache-outils">
                    <button
                      type="button"
                      className="po-outil"
                      aria-label={`Modifier la ligne ${t.libelle}`}
                      title="Modifier la ligne"
                      onClick={() => customize.onEdit(t)}
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="po-outil po-outil--retirer"
                      aria-label={`Retirer la ligne ${t.libelle}`}
                      title="Retirer la ligne"
                      onClick={() => customize.onRemove(t)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {customize && !c.fichiers && !disabled && (
        <button type="button" className="po-ajouter-ligne" onClick={customize.onAdd}>
          <Plus size={14} aria-hidden /> Ajouter une ligne
        </button>
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
