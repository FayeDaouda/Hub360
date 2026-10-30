'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@hub/domain';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { assignCard, getCardWorkload } from './api';
import { blockAssignment } from './labels';
import type { AssignableEmployee, EmployeeLoad, OpenProjectFile, ProjectCard, TaskWorkload } from './types';

type Props = {
  slug: string;
  projectId: string;
  card: ProjectCard;
  // Personnes que l'on peut choisir : tout le monde pour le Dir. GC, les
  // membres de ses équipes pour un chef d'équipe (servi par le serveur).
  assignable: AssignableEmployee[];
  teams: OpenProjectFile['equipes'];
  onClose: () => void;
  onDone: () => void;
};

type Group = { titre: string; personnes: AssignableEmployee[] };

// Les équipes du projet d'abord (dans leur ordre d'affectation), puis les
// autres personnes par cellule — repliées quand le projet a des équipes.
function groups(assignable: AssignableEmployee[], teams: OpenProjectFile['equipes']) {
  const names = teams.map((t) => t.nom);
  const team = names
    .map((nom) => ({ titre: nom, personnes: assignable.filter((a) => a.cellule === nom) }))
    .filter((g) => g.personnes.length);
  const rest = assignable.filter((a) => !a.cellule || !names.includes(a.cellule));
  const byCell = new Map<string, AssignableEmployee[]>();
  for (const a of rest)
    byCell.set(a.cellule ?? 'Sans cellule', [...(byCell.get(a.cellule ?? 'Sans cellule') ?? []), a]);
  const others: Group[] = [...byCell].map(([titre, personnes]) => ({ titre, personnes }));
  return { team, others };
}

// Charge sur la fenêtre du bloc, ce bloc compris : chiffre, barre et ton
// (zone normale des Réglages).
function load(c: EmployeeLoad | undefined, zone: TaskWorkload['zone']) {
  if (!c) return null;
  if (c.pourcentage === null) return { texte: 'absent sur la période', largeur: 0, ton: 'absent' };
  const ton = zone && c.pourcentage > zone.a ? 'charge' : zone && c.pourcentage < zone.de ? 'libre' : 'normal';
  const suffixe = ton === 'charge' ? ' · chargé' : ton === 'libre' ? ' · disponible' : '';
  return { texte: `${c.pourcentage} % avec ce bloc${suffixe}`, largeur: Math.min(c.pourcentage, 100), ton };
}

// Assigner le bloc (bouton de l'en-tête de la carte, 30/10/2026) : une
// personne pour toutes les tâches encore ouvertes, choisie avec sa charge.
export function CardAssignment({ slug, projectId, card, assignable, teams, onClose, onDone }: Props) {
  const current = blockAssignment(card.taches);
  const [chosen, setChosen] = useState<string | null>(current?.personneId ?? null);
  const [workload, setWorkload] = useState<TaskWorkload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCardWorkload(slug, projectId, card.id)
      .then((w) => !cancelled && setWorkload(w))
      .catch(() => !cancelled && setWorkload(null));
    return () => {
      cancelled = true;
    };
  }, [slug, projectId, card.id]);

  const open = card.taches.filter((t) => t.statut !== 'validee' && t.statut !== 'non_necessaire');
  const chiefs = new Set(teams.map((t) => t.chef).filter((x): x is string => !!x));
  const { team, others } = groups(assignable, teams);
  const chosenName = assignable.find((a) => a.id === chosen)?.nom ?? null;
  // Ce que le choix remplace : les tâches déjà confiées à quelqu'un d'autre.
  const replaced = new Map<string, number>();
  for (const t of open) {
    if (t.assigne && t.assigne.id !== chosen) replaced.set(t.assigne.nom, (replaced.get(t.assigne.nom) ?? 0) + 1);
  }
  const hasAssignee = open.some((t) => t.assigne);

  async function save(employeeId: string | null) {
    setBusy(true);
    setError(null);
    try {
      await assignCard(slug, projectId, card.id, employeeId);
      onDone();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'L’assignation a échoué.');
      setBusy(false);
    }
  }

  const row = (a: AssignableEmployee) => {
    const l = load(
      workload?.charges.find((c) => c.collaborateurId === a.id),
      workload?.zone ?? null,
    );
    return (
      <label key={a.id} className={`ab-personne${chosen === a.id ? ' is-choisie' : ''}`}>
        <input type="radio" name="ab-personne" checked={chosen === a.id} onChange={() => setChosen(a.id)} />
        <span className="ab-nom">
          {a.nom}
          {chiefs.has(a.nom) && <small> · chef d’équipe</small>}
        </span>
        {l && (
          <span className={`ab-charge ab-charge--${l.ton}`}>
            <span className="ab-barre" aria-hidden>
              <span style={{ width: `${l.largeur}%` }} />
            </span>
            {l.texte}
          </span>
        )}
      </label>
    );
  };

  return (
    // Portail : le dossier projet (verre, flou) piégerait la fenêtre fixe.
    <Modal onClose={onClose} busy={busy} portal className="ab-modale" labelledBy="ab-titre">
      <ModalHeader title={`Assigner « ${card.libelle} »`} titleId="ab-titre" onClose={onClose} closeDisabled={busy} />
      <div className="modal-body">
        <p className="po-aide">
          {open.length} tâche{open.length > 1 ? 's' : ''} ouverte{open.length > 1 ? 's' : ''}
          {workload?.periode && ` · du ${formatDate(workload.periode.debut)} au ${formatDate(workload.periode.fin)}`}.
          Les tâches déjà validées gardent leur personne.
        </p>
        {assignable.length === 0 && (
          <p className="po-aide">Personne à qui assigner : affectez d’abord des membres à l’équipe.</p>
        )}
        <div className="ab-liste" role="radiogroup" aria-label="Personne">
          {team.map((g) => (
            <fieldset key={g.titre} className="ab-groupe">
              <legend>{g.titre}</legend>
              {g.personnes.map(row)}
            </fieldset>
          ))}
          {others.length > 0 &&
            (team.length ? (
              <details className="ab-autres">
                <summary>Autres personnes</summary>
                {others.map((g) => (
                  <fieldset key={g.titre} className="ab-groupe">
                    <legend>{g.titre}</legend>
                    {g.personnes.map(row)}
                  </fieldset>
                ))}
              </details>
            ) : (
              others.map((g) => (
                <fieldset key={g.titre} className="ab-groupe">
                  <legend>{g.titre}</legend>
                  {g.personnes.map(row)}
                </fieldset>
              ))
            ))}
        </div>
        {chosenName && replaced.size > 0 && (
          <p className="ab-remplace" role="note">
            {[...replaced].map(([nom, n]) => `${n} tâche${n > 1 ? 's' : ''} de ${nom}`).join(', ')} passeront à{' '}
            {chosenName}.
          </p>
        )}
        {error && <FieldError>{error}</FieldError>}
        <div className="modal-actions">
          {hasAssignee && (
            <button type="button" className="btn-ghost ab-retirer" disabled={busy} onClick={() => save(null)}>
              Retirer l’assignation
            </button>
          )}
          <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !chosen || chosen === current?.personneId}
            onClick={() => save(chosen)}
          >
            {busy ? '…' : chosenName ? `Assigner à ${chosenName}` : 'Assigner'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
