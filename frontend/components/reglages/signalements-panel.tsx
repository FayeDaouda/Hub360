'use client';

import { useState } from 'react';
import {
  changerStatutSignalement,
  ouvrirCaptureSignalement,
  STATUTS_SIGNALEMENT,
  type Signalement,
  type StatutSignalement,
} from '@/lib/signalements';
import { formatDate } from '@hub/domain';
import { Pill } from '@/components/ui/pill';
import { EmptyState } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';

const FILTRES: { cle: StatutSignalement | 'tous'; libelle: string }[] = [
  { cle: 'a_traiter', libelle: 'À traiter' },
  { cle: 'en_cours', libelle: 'En cours' },
  { cle: 'corrige', libelle: 'Corrigés' },
  { cle: 'tous', libelle: 'Tous' },
];

// Réglages › Signalements : les retours « Signaler un problème », du plus
// récent au plus ancien, suivis jusqu'à leur correction.
export function SignalementsPanel({
  slug,
  signalements,
  onMaj,
}: {
  slug: string;
  signalements: Signalement[];
  onMaj: (l: Signalement[]) => void;
}) {
  const [filtre, setFiltre] = useState<StatutSignalement | 'tous'>('a_traiter');
  const [erreur, setErreur] = useState<string | null>(null);
  const visibles = signalements.filter((s) => filtre === 'tous' || s.statut === filtre);

  async function changer(s: Signalement, statut: StatutSignalement) {
    setErreur(null);
    try {
      onMaj(await changerStatutSignalement(slug, s.id, statut));
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'Changement impossible.');
    }
  }

  return (
    <section className="panel glass-panel dmd-section reg-panel">
      <h2 className="dmd-titre">Signalements</h2>
      <p className="dmd-note">
        Les retours envoyés depuis « Aide › Signaler un problème », avec la page, le rôle et l’appareil de leur auteur.
      </p>
      <div className="fin-filtres" role="group" aria-label="Filtrer les signalements">
        {FILTRES.map((f) => (
          <button
            key={f.cle}
            type="button"
            className={filtre === f.cle ? 'is-active' : ''}
            aria-pressed={filtre === f.cle}
            onClick={() => setFiltre(f.cle)}
          >
            {f.libelle} (
            {f.cle === 'tous' ? signalements.length : signalements.filter((s) => s.statut === f.cle).length})
          </button>
        ))}
      </div>
      {erreur && <FieldError>{erreur}</FieldError>}
      {visibles.length === 0 ? (
        <EmptyState>Aucun signalement dans ce filtre.</EmptyState>
      ) : (
        <ul className="sig-liste">
          {visibles.map((s) => (
            <li key={s.id} className="sig-ligne">
              <span className="sig-tete">
                <Pill tone={STATUTS_SIGNALEMENT[s.statut].ton}>{STATUTS_SIGNALEMENT[s.statut].libelle}</Pill>
                <span className="cell-sub">
                  {formatDate(s.creeLe)} · {s.auteur ?? 'compte supprimé'} · {s.role} · {s.appareil}
                </span>
              </span>
              <p className="sig-texte">{s.description}</p>
              <span className="cell-sub sig-page">Page : {s.page}</span>
              <span className="sig-actions">
                {s.aCapture && (
                  <button
                    type="button"
                    className="lien-inline"
                    onClick={() => ouvrirCaptureSignalement(slug, s.id).catch(() => setErreur('Capture indisponible.'))}
                  >
                    Voir la capture
                  </button>
                )}
                <select
                  className="field-input sig-statut"
                  aria-label="Statut du signalement"
                  value={s.statut}
                  onChange={(e) => changer(s, e.target.value as StatutSignalement)}
                >
                  {(Object.keys(STATUTS_SIGNALEMENT) as StatutSignalement[]).map((k) => (
                    <option key={k} value={k}>
                      {STATUTS_SIGNALEMENT[k].libelle}
                    </option>
                  ))}
                </select>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
