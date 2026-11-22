'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { getPerimetreAnnuaire, PERIMETRES, reglerPerimetreAnnuaire, type PerimetreAnnuaire } from '@/lib/annuaire';
import { Field, FieldError } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/feedback';

// Administration du HUB › Annuaire (22/11/2026) : le périmètre de l'annuaire
// de la société de connexion (CIO, Administrateur HUB). Un motif est exigé ;
// le changement entre au journal d'audit.
export function AnnuairePanel({ slug }: { slug: string }) {
  const [actuel, setActuel] = useState<PerimetreAnnuaire | null>(null);
  const [choix, setChoix] = useState<PerimetreAnnuaire | null>(null);
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);

  useEffect(() => {
    getPerimetreAnnuaire(slug)
      .then(({ perimetre }) => {
        setActuel(perimetre);
        setChoix(perimetre);
      })
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Réglage indisponible.'));
  }, [slug]);

  async function enregistrer() {
    if (!choix) return;
    setEnvoi(true);
    setErreur(null);
    setFait(false);
    try {
      const { perimetre } = await reglerPerimetreAnnuaire(slug, choix, motif.trim());
      setActuel(perimetre);
      setChoix(perimetre);
      setMotif('');
      setFait(true);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le réglage n’a pas été enregistré.');
    } finally {
      setEnvoi(false);
    }
  }

  if (!actuel) {
    return (
      <section className="groupe-panel glass-panel" aria-busy={!erreur} aria-label="Annuaire">
        {erreur ? <FieldError>{erreur}</FieldError> : <Skeleton />}
      </section>
    );
  }
  const change = choix !== actuel;
  return (
    <section className="groupe-panel glass-panel annuaire-reglage" aria-label="Annuaire">
      <fieldset className="annuaire-reglage-choix" disabled={envoi}>
        <legend className="field-label">Ce que voient les salariés de cette société</legend>
        {PERIMETRES.map((p) => (
          <label key={p.cle} className={`annuaire-reglage-option${choix === p.cle ? ' is-choisi' : ''}`}>
            <input
              type="radio"
              name="perimetre-annuaire"
              value={p.cle}
              checked={choix === p.cle}
              onChange={() => {
                setChoix(p.cle);
                setFait(false);
              }}
            />
            <span>
              <strong>
                {p.titre}
                {actuel === p.cle && <span className="annuaire-badge">En service</span>}
              </strong>
              <span className="annuaire-detail">{p.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {change && (
        <Field label="Motif (entre au journal d’audit)">
          <textarea
            className="field-input"
            rows={2}
            maxLength={500}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Pourquoi ce changement ?"
          />
        </Field>
      )}
      {erreur && <FieldError>{erreur}</FieldError>}
      {fait && (
        <p className="annuaire-reglage-ok" role="status">
          Enregistré : l’annuaire suit ce périmètre dès maintenant.
        </p>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={enregistrer}
          disabled={!change || motif.trim().length < 3 || envoi}
        >
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </section>
  );
}
