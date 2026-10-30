'use client';

import { useEffect, useState } from 'react';
import { Pill } from '@/components/ui/pill';
import { FieldError } from '@/components/ui/field';
import { getProjectTeams, setProjectTeams } from './api';
import type { ProjectTeams as Teams } from './types';

type Props = {
  slug: string;
  projectId: string;
  // Écriture sur le module « équipe » (le Dir. GC, l'administration).
  canEdit: boolean;
  // Après une affectation (le dossier du projet relit son en-tête).
  onChange?: () => void;
};

// Équipes d'un projet (décision du 29/10/2026) : le Dir. GC les affecte dès
// l'Onboard (fiche du dossier CRM) et les modifie ensuite (dossier projet).
// Le chef de chaque équipe y assigne le travail ; ses membres voient le
// projet. Rien ne s'affiche pour qui ne lit pas les projets.
export function ProjectTeams({ slug, projectId, canEdit, onChange }: Props) {
  const [teams, setTeams] = useState<Teams | null>(null);
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProjectTeams(slug, projectId)
      .then((t) => !cancelled && setTeams(t))
      .catch(() => !cancelled && setTeams(null));
    return () => {
      cancelled = true;
    };
  }, [slug, projectId]);

  if (!teams) return null;

  function edit() {
    setChosen(teams!.equipes.map((e) => e.id));
    setError(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      setTeams(await setProjectTeams(slug, projectId, chosen));
      setEditing(false);
      onChange?.();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'L’affectation a échoué.');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) => setChosen((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  return (
    <div className="pt-equipes">
      <div className="cycle-dossier-tete">
        <span className="field-label">Équipes</span>
        {teams.equipes.length === 0 ? (
          <Pill tone="attention">Sans équipe</Pill>
        ) : (
          teams.equipes.map((e) => (
            <Pill key={e.id} tone="neutre" title={e.code}>
              {e.nom} · chef d’équipe {e.chef ?? 'à désigner'}
            </Pill>
          ))
        )}
        {canEdit && !editing && (
          <button type="button" className="lien-inline" onClick={edit}>
            {teams.equipes.length ? 'Modifier' : 'Affecter une équipe'}
          </button>
        )}
      </div>
      {teams.equipes.length === 0 && !editing && (
        <p className="field-aide">
          {canEdit
            ? 'Affectez le projet à une équipe : son chef d’équipe y répartit le travail et ses membres voient le projet.'
            : 'Le Dir. GC affecte le projet à une équipe.'}
        </p>
      )}
      {editing &&
        (teams.disponibles.length ? (
          <>
            <fieldset className="deb-cellules">
              <legend className="field-label">Cellules</legend>
              {teams.disponibles.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} /> {c.nom}{' '}
                  <span className="field-aide">
                    {c.code} · chef d’équipe {c.chef ?? 'à désigner'}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="cycle-dossier-actions">
              <button type="button" className="btn-primary" disabled={busy} onClick={save}>
                Enregistrer
              </button>
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Annuler
              </button>
            </div>
          </>
        ) : (
          <p className="field-aide">Aucune cellule dans cette société : créez-la d’abord dans Équipes.</p>
        ))}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
