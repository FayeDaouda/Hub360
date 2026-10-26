'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { formatAmount, formatNumber } from '@/lib/format';
import {
  deciderSalaire,
  getDetailSalaire,
  getSalairesAValider,
  LIBELLE_MOTIF_SALAIRE,
  type DetailSalaire,
  type SalaireAValider,
} from '@/lib/rh';
import { formatDate } from '@/lib/dates';

const message = (e: unknown, repli: string) => (e instanceof ApiError ? e.message : repli);

// Salaires à valider (revue RH validée 20/10/2026) : en tête de la page RH
// pour le CFO (le CEO pour le salaire du CFO). La liste ne montre aucun
// montant ; « Examiner » les affiche (affichage tracé) avant de décider.
export function SalairesAValider({ slug }: { slug: string }) {
  const [liste, setListe] = useState<SalaireAValider[]>([]);
  const [ouvert, setOuvert] = useState<DetailSalaire | null>(null);
  const [refus, setRefus] = useState<string | null>(null); // null = pas en train de refuser
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getSalairesAValider(slug)
      .then(setListe)
      .catch(() => setListe([]));
  }, [slug]);

  if (!liste.length) return null;

  async function examiner(id: string) {
    setErreur(null);
    setRefus(null);
    try {
      setOuvert(await getDetailSalaire(slug, id));
    } catch (e) {
      setErreur(message(e, 'Détail indisponible.'));
    }
  }

  async function decider(valide: boolean) {
    if (!ouvert) return;
    setEnvoi(true);
    setErreur(null);
    try {
      setListe(await deciderSalaire(slug, ouvert.id, valide, valide ? undefined : (refus ?? '')));
      setOuvert(null);
      setRefus(null);
    } catch (e) {
      setErreur(message(e, 'Décision impossible.'));
    } finally {
      setEnvoi(false);
    }
  }

  const ecart =
    ouvert && ouvert.actuel ? Math.round(((ouvert.montant - ouvert.actuel) / ouvert.actuel) * 1000) / 10 : null;

  return (
    <section className="panel glass-panel sav" aria-label="Salaires à valider">
      <h2 className="dmd-titre">
        <BadgeCheck size={17} aria-hidden /> Salaires à valider · {liste.length}
      </h2>
      <ul className="sav-liste">
        {liste.map((s) => (
          <li key={s.id} className="sav-ligne">
            <span className="sav-corps">
              <strong>
                {s.salarie} · {LIBELLE_MOTIF_SALAIRE[s.motif]}
              </strong>
              <span className="cell-sub">
                effet le {formatDate(s.dateEffet, 'date inconnue')} · proposé
                {s.proposePar ? ` par ${s.proposePar}` : ''} le {formatDate(s.proposeLe, 'date inconnue')}
              </span>
            </span>
            {ouvert?.id === s.id ? (
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setOuvert(null)}>
                Fermer
              </button>
            ) : (
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => examiner(s.id)}>
                Examiner
              </button>
            )}
            {ouvert?.id === s.id && (
              <div className="sav-detail">
                <p className="sav-montants">
                  <span>
                    <span className="field-label">Actuel</span>
                    {ouvert.actuel == null ? 'aucun' : formatAmount(ouvert.actuel)}
                  </span>
                  <span aria-hidden>→</span>
                  <span>
                    <span className="field-label">Proposé</span>
                    <strong>{formatAmount(ouvert.montant)}</strong>
                    {ecart != null && (
                      <span className="cell-sub">{`${ecart > 0 ? '+' : ''}${formatNumber(ecart)} %`}</span>
                    )}
                  </span>
                </p>
                {refus !== null && (
                  <label className="field">
                    <span className="field-label">Motif du refus (transmis à la RH)</span>
                    <textarea
                      className="field-input"
                      rows={2}
                      maxLength={300}
                      value={refus}
                      onChange={(e) => setRefus(e.target.value)}
                    />
                  </label>
                )}
                <div className="sav-actions">
                  {refus === null ? (
                    <>
                      <button type="button" className="btn-ghost" disabled={envoi} onClick={() => setRefus('')}>
                        Refuser
                      </button>
                      <button type="button" className="btn-primary" disabled={envoi} onClick={() => decider(true)}>
                        Valider
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn-ghost" disabled={envoi} onClick={() => setRefus(null)}>
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={envoi || !refus.trim()}
                        onClick={() => decider(false)}
                      >
                        Confirmer le refus
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {erreur && <p className="field-erreur">{erreur}</p>}
    </section>
  );
}
