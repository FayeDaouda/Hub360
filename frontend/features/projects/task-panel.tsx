'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FieldError } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { STATUTS_DEVIS } from '@/lib/types';
import { downloadSubmissionPiece } from './api';
import { stepNumber, taskPill } from './labels';
import { EMPTY_SUBMISSION_ENTRY, type SubmissionEntry } from './submission-entry';
import { TaskAssignment, useTaskWorkload } from './task-assignment';
import { ExtensionDecision, SubmissionReview, VisaDecision } from './task-decisions';
import { DepositForm, ExtensionRequestForm, type ExtensionEntry } from './task-forms';
import { SubmittedFiles, TaskHistory } from './task-record';
import { TaskDetails, TaskSummary } from './task-summary';
import { ThreadView } from './thread';
import type { AssignableEmployee, ProjectCard, ProjectTask } from './types';
import { useTaskAction } from './use-task-action';

type Props = {
  slug: string;
  projectId: string;
  code: string;
  card: ProjectCard;
  task: ProjectTask;
  // null = pas le droit d'assigner (lecture seule).
  assignable: AssignableEmployee[] | null;
  meId: string;
  // null = lecture seule du fil.
  mentionable: { id: string; nom: string }[] | null;
  onUpdate: () => Promise<void>;
  // « Demander un délai » depuis Mes tâches : le formulaire s'ouvre directement.
  extensionOpen?: boolean;
};

// Panneau d'une tâche (maquette « Projets », réorganisé le 23/10/2026) :
// en-tête (étape, nom de la tâche, statut) ; barre d'actions « Déposer » /
// « Demander un délai » qui ouvre UN formulaire à la fois ; résumé (échéance,
// validation, durée) ; décisions du valideur (remise, prolongation, visa) et
// assignation ; discussion ; « Détails » repliés (fenêtre, échéance figée,
// écart) ; fichiers et historique. Les règles du système sont dans des « ? ».
// Une autre tâche = un autre panneau : l'appelant le remonte (key), sa saisie
// repart de zéro.
export function TaskPanel({
  slug,
  projectId,
  code,
  card,
  task: t,
  assignable,
  meId,
  mentionable,
  onUpdate,
  extensionOpen = false,
}: Props) {
  const { busy, error, run, read } = useTaskAction(onUpdate);
  // Formulaire ouvert sous la barre d'actions : un seul à la fois. Leur
  // saisie reste ici : fermé puis rouvert, le formulaire la retrouve.
  const [action, setAction] = useState<'deposer' | 'delai' | null>(extensionOpen ? 'delai' : null);
  const [deposit, setDeposit] = useState<SubmissionEntry>(EMPTY_SUBMISSION_ENTRY);
  const [extension, setExtension] = useState<ExtensionEntry>({ until: '', reason: '' });
  const workload = useTaskWorkload(slug, projectId, t, assignable !== null);

  const pill = taskPill(t.etat);
  const v = t.validation;
  const manager = assignable !== null;
  const canAssignHere =
    assignable !== null && card.etat.code !== 'desactivee' && t.statut !== 'validee' && t.statut !== 'non_necessaire';
  const toggle = (a: 'deposer' | 'delai') => setAction((x) => (x === a ? null : a));
  const openFile = (pieceId: string) =>
    read(() => downloadSubmissionPiece(slug, projectId, t.id, pieceId), 'Fichier indisponible.');
  const block = { slug, projectId, task: t, busy, run };

  return (
    <aside className="po-panneau tp" aria-label={`Tâche ${t.libelle}`}>
      <header className="tp-entete">
        <p className="po-kicker">
          {stepNumber(card.etapeNumero)} {card.etapeLibelle} · {card.libelle}
        </p>
        <h2 className="po-panneau-titre">{t.libelle}</h2>
        <div className="po-pastilles">
          <Pill tone={pill.ton}>{pill.libelle}</Pill>
          {t.sourceNative && <Pill tone="neutre">source native exigée</Pill>}
        </div>
      </header>

      {(t.peutRemettre || t.peutDemanderProlongation) && (
        <div className="tp-actions" role="group" aria-label="Actions sur la tâche">
          {t.peutRemettre && (
            // Formulaire ouvert : son propre bouton « Déposer » est l'action
            // principale ; celui de la barre passe en contour (un seul plein).
            <button
              type="button"
              className={action === 'deposer' ? 'btn-ghost' : 'btn-primary'}
              aria-expanded={action === 'deposer'}
              onClick={() => toggle('deposer')}
            >
              {v.mode === 'depot'
                ? 'Déposer le justificatif'
                : t.statut === 'reprise'
                  ? 'Déposer la reprise'
                  : 'Déposer'}
            </button>
          )}
          {t.peutDemanderProlongation && (
            <button
              type="button"
              className="btn-ghost"
              aria-expanded={action === 'delai'}
              onClick={() => toggle('delai')}
            >
              Demander un délai
            </button>
          )}
        </div>
      )}

      {action === 'deposer' && t.peutRemettre && (
        <DepositForm {...block} onClose={() => setAction(null)} entry={deposit} onEntry={setDeposit} />
      )}
      {action === 'delai' && t.peutDemanderProlongation && (
        <ExtensionRequestForm {...block} onClose={() => setAction(null)} entry={extension} onEntry={setExtension} />
      )}
      {error && <FieldError>{error}</FieldError>}

      <TaskSummary task={t} manager={manager} />

      {t.avenant && (
        <p className="po-panneau-note">
          Facturé par l’avenant{' '}
          <Link className="lien-inline" href={`/admin/${slug}/facturation?devis=${t.avenant.devisId}`}>
            {t.avenant.reference ?? 'en préparation'}
          </Link>{' '}
          · {STATUTS_DEVIS[t.avenant.statut]}
          {t.avenant.statut === 'brouillon' && ' : à envoyer au client'}
        </p>
      )}
      {t.etat.code === 'non_necessaire' && t.motif && <p className="po-panneau-note">Non nécessaire : {t.motif}.</p>}
      {card.etat.code === 'desactivee' && (
        <p className="po-panneau-note">Carte désactivée : {card.etat.motif}. Son temps n’est pas compté.</p>
      )}
      {t.descriptif && (
        <div className="po-descriptif">
          <p className="tp-section">Descriptif</p>
          <p>{t.descriptif}</p>
        </div>
      )}

      {t.prolongation.enAttente && <ExtensionDecision {...block} />}
      {t.visa && (t.statut === 'validee' || t.visa.le) && <VisaDecision {...block} />}
      {t.peutDecider && <SubmissionReview {...block} onOpenFile={openFile} />}
      {canAssignHere && <TaskAssignment {...block} assignable={assignable} workload={workload} />}

      <ThreadView
        key={t.id}
        slug={slug}
        projectId={projectId}
        taskId={t.id}
        meId={meId}
        mentionable={mentionable}
        onUpdate={onUpdate}
      />

      <TaskDetails task={t} />
      <SubmittedFiles code={code} pieces={t.pieces} onOpen={openFile} />
      <TaskHistory slug={slug} projectId={projectId} task={t} />
    </aside>
  );
}
