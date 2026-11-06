'use client';

import { useState, type FormEvent } from 'react';
import { History, SlidersHorizontal } from 'lucide-react';
import { formatDateTime } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { addProjectLine, updateProjectLine } from './api';
import type { OpenProjectFile, ProjectCard, ProjectTask } from './types';

// Personnalisation d'un projet (01/11/2026) : la direction ajoute, modifie
// ou retire des lignes de CE projet, sans toucher au gabarit (il garde par
// défaut les lignes de sa version). Chaque changement entre au journal du
// projet, affiché ici.

export function CustomizeBar({
  file: d,
  active,
  onToggle,
}: {
  file: OpenProjectFile;
  active: boolean;
  onToggle: () => void;
}) {
  if (!d.peutPersonnaliser && !d.personnalisations.length) return null;
  return (
    <div className={`po-perso${active ? ' is-actif' : ''}`}>
      <div className="po-perso-tete">
        {d.peutPersonnaliser && (
          <button
            type="button"
            className={active ? 'btn-primary btn-primary--sm' : 'btn-ghost btn-ghost--sm'}
            aria-pressed={active}
            onClick={onToggle}
          >
            <SlidersHorizontal size={14} aria-hidden />{' '}
            {active ? 'Terminer la personnalisation' : 'Personnaliser le projet'}
          </button>
        )}
        {active && (
          <span className="po-aide">
            Ajoutez, modifiez ou retirez des lignes de ce projet. Le gabarit ne change pas ; une ligne déjà remise se
            marque « Non nécessaire ».
          </span>
        )}
      </div>
      {d.personnalisations.length > 0 && (
        <details className="po-perso-journal">
          <summary>
            <History size={14} aria-hidden /> Personnalisations du projet · {d.personnalisations.length}
          </summary>
          <ul>
            {d.personnalisations.map((m) => (
              <li key={m.id}>
                <span>{m.libelle}</span>
                <span className="po-aide">
                  {formatDateTime(m.le)}
                  {m.par ? ` · ${m.par}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Ajouter une ligne en fin de carte, ou modifier une ligne du projet. Une
// ligne validée (ou non nécessaire) ne change plus que d'intitulé, de
// descriptif et de fichier obligatoire.
export function LineDialog({
  slug,
  projectId,
  card,
  task,
  onClose,
  onDone,
}: {
  slug: string;
  projectId: string;
  card: ProjectCard;
  task?: ProjectTask;
  onClose: () => void;
  onDone: () => void;
}) {
  const locked = !!task && (task.statut === 'validee' || task.statut === 'non_necessaire');
  const [label, setLabel] = useState(task?.libelle ?? '');
  const [start, setStart] = useState(task?.debutJ?.toString() ?? '');
  const [end, setEnd] = useState(task?.finJ?.toString() ?? '');
  const [hours, setHours] = useState(task?.heures != null ? String(task.heures).replace('.', ',') : '');
  const [visa, setVisa] = useState(!!task?.visa);
  const [fileRequired, setFileRequired] = useState(task?.fichierObligatoire ?? true);
  const [description, setDescription] = useState(task?.descriptif ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const [s, f] = [start.trim(), end.trim()].map((v) => (v ? Number(v) : null));
    if ((s === null) !== (f === null)) return setError('Renseignez J début et J fin, ou aucun des deux.');
    if (s !== null && f !== null && (!Number.isInteger(s) || !Number.isInteger(f) || s < 1 || s > f)) {
      return setError('Fenêtre invalide : jours entiers, à partir de J1, début avant la fin.');
    }
    const h = hours.trim() ? Number(hours.replace(',', '.')) : null;
    if (h !== null && !(h > 0 && h <= 999)) return setError('Temps invalide : heures positives.');
    setSending(true);
    try {
      if (task) {
        await updateProjectLine(slug, projectId, task.id, {
          libelle: label.trim(),
          descriptif: description,
          fichierObligatoire: fileRequired,
          ...(!locked && { debutJ: s, finJ: f, heures: h, visaRequis: visa }),
        });
      } else {
        await addProjectLine(slug, projectId, card.id, {
          libelle: label.trim(),
          ...(s !== null && f !== null && { debutJ: s, finJ: f }),
          heures: h,
          visaRequis: visa,
          fichierObligatoire: fileRequired,
          ...(description.trim() && { descriptif: description.trim() }),
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La ligne n’a pas été enregistrée.');
      setSending(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={sending} portal labelledBy="ligne-projet-titre">
      <header className="modal-header">
        <div>
          <span className="cell-sub">
            {task ? 'Modifier la ligne · ce projet seulement' : 'Nouvelle ligne · ce projet seulement'}
          </span>
          <h2 id="ligne-projet-titre">{card.libelle}</h2>
        </div>
        <CloseButton onClick={onClose} disabled={sending} />
      </header>
      <form className="modal-body po-ligne-form" onSubmit={submit}>
        <Field label="Intitulé">
          <input
            className="field-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            minLength={2}
            maxLength={160}
          />
        </Field>
        <div className="po-ligne-form-rangee">
          <Field label="J début (facultatif)">
            <input
              className="field-input"
              inputMode="numeric"
              value={start}
              disabled={locked}
              placeholder={card.debutJ?.toString() ?? ''}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="J fin (facultatif)">
            <input
              className="field-input"
              inputMode="numeric"
              value={end}
              disabled={locked}
              placeholder={card.finJ?.toString() ?? ''}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          <Field label="Temps standard (h)">
            <input
              className="field-input"
              inputMode="decimal"
              value={hours}
              disabled={locked}
              placeholder="sans temps atelier"
              onChange={(e) => setHours(e.target.value)}
            />
          </Field>
        </div>
        <div className="po-ligne-form-cases">
          <label>
            <input type="checkbox" checked={visa} disabled={locked} onChange={(e) => setVisa(e.target.checked)} /> Visa
            DPLG
          </label>
          <label>
            <input type="checkbox" checked={fileRequired} onChange={(e) => setFileRequired(e.target.checked)} /> Fichier
            obligatoire au dépôt
          </label>
        </div>
        <Field label="Descriptif (facultatif)">
          <textarea
            className="field-input"
            rows={3}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {locked && (
          <p className="po-aide">
            Ligne validée ou non nécessaire : sa fenêtre, son temps et son visa ne changent plus.
          </p>
        )}
        <p className="po-aide">
          Les dates se calculent en jours ouvrés depuis J1 du projet. Le changement est tracé dans le journal du projet.
        </p>
        {error && <FieldError>{error}</FieldError>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={sending}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={sending}>
            {sending ? 'Enregistrement…' : task ? 'Enregistrer' : 'Ajouter la ligne'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
