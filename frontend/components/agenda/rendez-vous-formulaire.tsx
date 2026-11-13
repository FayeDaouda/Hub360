'use client';

import { useState, type FormEvent } from 'react';
import { CalendarClock } from 'lucide-react';
import { dakarInstant } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { creerRendezVous, modifierRendezVous } from '@/lib/agenda';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';

export type ValeursRendezVous = {
  titre: string;
  jour: string; // AAAA-MM-JJ
  debut: string; // HH:MM, heure de Dakar
  fin: string;
  lieu: string;
  description: string;
  inviteIds: string[];
};

export const valeursVides = (jour: string, debut = '09:00', fin = '10:00'): ValeursRendezVous => ({
  titre: '',
  jour,
  debut,
  fin,
  lieu: '',
  description: '',
  inviteIds: [],
});

// Nouveau rendez-vous ou modification (12/11/2026) : le même formulaire.
// `rendezVousId` présent : modification (l'organisateur). `personnes` : qui
// peut être invité ; sans le droit « Réunions », seuls les invités déjà là
// restent proposés (on peut les retirer, pas en ajouter).
export function RendezVousFormulaire({
  slug,
  rendezVousId,
  initial,
  personnes,
  onClose,
  onEnregistre,
}: {
  slug: string;
  rendezVousId?: string;
  initial: ValeursRendezVous;
  personnes: { id: string; nom: string }[];
  onClose: () => void;
  onEnregistre: () => void;
}) {
  const [v, setV] = useState(initial);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const modification = !!rendezVousId;
  const champ = <K extends keyof ValeursRendezVous>(k: K, valeur: ValeursRendezVous[K]) =>
    setV((x) => ({ ...x, [k]: valeur }));

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (v.fin <= v.debut) {
      setErreur('La fin doit suivre le début.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    const corps = {
      titre: v.titre,
      debut: dakarInstant(v.jour, v.debut),
      fin: dakarInstant(v.jour, v.fin),
      lieu: v.lieu || undefined,
      description: v.description || undefined,
      inviteIds: v.inviteIds,
    };
    try {
      if (rendezVousId) await modifierRendezVous(slug, rendezVousId, corps);
      else await creerRendezVous(slug, corps);
      onEnregistre();
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.message
          : modification
            ? 'Le rendez-vous n’a pas été modifié.'
            : 'Le rendez-vous n’a pas été créé.',
      );
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="rdv-titre">
      <header className="modal-header">
        <h2 id="rdv-titre">
          <CalendarClock size={18} aria-hidden /> {modification ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
        </h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <form className="modal-body agenda-formulaire" onSubmit={enregistrer}>
        <Field label="Objet">
          <input
            className="field-input"
            value={v.titre}
            onChange={(e) => champ('titre', e.target.value)}
            required
            minLength={2}
            maxLength={160}
            autoFocus={!modification}
          />
        </Field>
        <div className="agenda-formulaire-ligne">
          <Field label="Date">
            <input
              type="date"
              className="field-input"
              value={v.jour}
              onChange={(e) => champ('jour', e.target.value)}
              required
            />
          </Field>
          <Field label="Début">
            <input
              type="time"
              className="field-input"
              value={v.debut}
              onChange={(e) => champ('debut', e.target.value)}
              required
            />
          </Field>
          <Field label="Fin">
            <input
              type="time"
              className="field-input"
              value={v.fin}
              onChange={(e) => champ('fin', e.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="Lieu (facultatif)">
          <input
            className="field-input"
            value={v.lieu}
            maxLength={160}
            onChange={(e) => champ('lieu', e.target.value)}
          />
        </Field>
        <Field label="Note (facultatif)">
          <textarea
            className="field-input"
            rows={3}
            maxLength={2000}
            value={v.description}
            onChange={(e) => champ('description', e.target.value)}
          />
        </Field>
        {personnes.length > 0 && (
          <fieldset className="agenda-invites">
            <legend className="field-label">Inviter (facultatif)</legend>
            {personnes.map((p) => (
              <label key={p.id} className="agenda-invite">
                <input
                  type="checkbox"
                  checked={v.inviteIds.includes(p.id)}
                  onChange={() =>
                    champ(
                      'inviteIds',
                      v.inviteIds.includes(p.id) ? v.inviteIds.filter((x) => x !== p.id) : [...v.inviteIds, p.id],
                    )
                  }
                />
                {p.nom}
              </label>
            ))}
          </fieldset>
        )}
        {modification && v.inviteIds.length > 0 && (
          <p className="agenda-detail">Les invités reçoivent la réunion à jour, dans le HUB et par e-mail.</p>
        )}
        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={envoi}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={envoi}>
            {envoi ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
