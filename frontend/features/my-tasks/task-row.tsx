'use client';

import { useState, type DragEvent } from 'react';
import Link from 'next/link';
import { AtSign, RotateCcw } from 'lucide-react';
import { formatDayMonth } from '@hub/domain';
import type { MyMention } from '@/features/projects/types';
import { MoreMenu } from './more-menu';
import { relativeDue, type Tone } from './task-groups';
import type { MyTask } from './types';
import { transitionStyle } from './view-transition';

// Colonne « échéance » d'une ligne : la date relative et sa précision.
function dueLabel(t: MyTask, today: string): { rel: string; date: string } {
  if (t.statut === 'remise') {
    return {
      rel: 'En validation',
      date: `v${String(t.version).padStart(2, '0')}${t.remisLe ? ` · déposée le ${formatDayMonth(t.remisLe)}` : ''}`,
    };
  }
  if (t.statut === 'bloquee') {
    return {
      rel: 'Attend l’étape précédente',
      date: t.echeance ? `à rendre le ${formatDayMonth(t.echeance)}` : 'pas encore de dates',
    };
  }
  if (t.statut === 'prolongee' && t.prolongeeJusquau) {
    return {
      rel: `Prolongée · ${relativeDue(t.prolongeeJusquau, today).toLowerCase()}`,
      date: `jusqu’au ${formatDayMonth(t.prolongeeJusquau)}${t.echeance ? ` · prévue le ${formatDayMonth(t.echeance)}` : ''}`,
    };
  }
  if (!t.echeance) return { rel: 'À planifier', date: 'pas encore de dates' };
  return {
    rel:
      t.statut === 'a_reprendre'
        ? `Reprise · ${relativeDue(t.echeance, today).toLowerCase()}`
        : relativeDue(t.echeance, today),
    date:
      t.statut === 'a_venir' && t.debut
        ? `démarre le ${formatDayMonth(t.debut)} · à rendre le ${formatDayMonth(t.echeance)}`
        : `à rendre le ${formatDayMonth(t.echeance)}`,
  };
}

// Une tâche de la liste : toute la ligne l'ouvre (panneau latéral) ; un
// fichier glissé dessus prépare son dépôt.
export function TaskRow({
  t,
  tone,
  late,
  base,
  today,
  withoutProject,
  mentions,
  onMentions,
  onOpen,
  onSubmit,
  onFiles,
  fileInFlight,
}: {
  t: MyTask;
  tone: Tone;
  late: boolean;
  base: string;
  today: string;
  withoutProject: boolean;
  mentions?: MyMention[];
  onMentions: (list: MyMention[]) => void;
  onOpen: (extension: boolean) => void;
  onSubmit?: () => void;
  onFiles?: (files: FileList) => void;
  fileInFlight: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const due = dueLabel(t, today);

  const drop = onFiles
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setHovered(true);
        },
        onDragLeave: () => setHovered(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setHovered(false);
          if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
        },
      }
    : {};

  return (
    <li
      className={`mt-ligne mt-ligne--ouvrable${hovered ? ' is-depot' : fileInFlight && onFiles ? ' is-cible' : ''}`}
      data-ton={tone}
      data-tache={t.id}
      style={transitionStyle(t.id)}
      // Toute la ligne ouvre la tâche ; ses boutons et liens gardent leur
      // propre action. Au clavier : le titre (bouton) reste le point d'entrée.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a, input, label, select, textarea')) return;
        onOpen(false);
      }}
      {...drop}
    >
      <span className="mt-corps">
        <button type="button" className="mt-titre mt-titre-bouton" onClick={() => onOpen(false)}>
          {t.libelle}
        </button>
        <span className="mt-meta">
          {!withoutProject && (
            <>
              <Link className="mt-code" href={`${base}/projets?projet=${t.projetId}`}>
                {t.projetCode}
              </Link>
              <span>{t.projetClient}</span>
              <span className="mt-sep" aria-hidden>
                ·
              </span>
            </>
          )}
          <span>{t.etape}</span>
        </span>
        {t.renvoiMotif && (
          <span className="mt-motif">
            <RotateCcw size={13} aria-hidden /> {t.renvoiMotif}
          </span>
        )}
        {mentions && mentions.length > 0 && (
          <button
            type="button"
            className="mt-pastille-mention"
            title={`« ${mentions[0].texte} »`}
            onClick={() => onMentions(mentions)}
          >
            <AtSign size={13} aria-hidden />
            {mentions.length === 1
              ? `${mentions[0].auteur ?? 'Quelqu’un'} vous mentionne`
              : `${mentions.length} mentions non lues`}
          </button>
        )}
      </span>
      <span className="mt-echeance">
        <span className="mt-echeance-rel">{hovered ? 'Lâchez pour déposer' : due.rel}</span>
        <span className="mt-echeance-date">{due.date}</span>
      </span>
      <span className="mt-action">
        {/* « Demander un délai » : la prolongation est accordée (ou non) par
            le N+1 — le bouton ne prolonge rien lui-même. */}
        {t.statut === 'en_retard' && (
          <>
            <button type="button" className="btn-ghost btn-ghost--sm mt-secondaire" onClick={() => onOpen(true)}>
              Demander un délai
            </button>
            <MoreMenu
              actions={[
                { label: 'Demander un délai', run: () => onOpen(true) },
                { label: 'Ouvrir la tâche', run: () => onOpen(false) },
              ]}
            />
          </>
        )}
        {onSubmit && (
          <button
            type="button"
            className={late ? 'btn-primary btn-primary--sm' : 'btn-ghost btn-ghost--sm'}
            data-action="deposer"
            onClick={onSubmit}
          >
            Déposer
          </button>
        )}
      </span>
    </li>
  );
}
