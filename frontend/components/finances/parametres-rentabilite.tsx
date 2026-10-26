'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import {
  formatParametre,
  getParametresRentabilite,
  modifierParametreRentabilite,
  type Parametres,
} from '@/lib/rentabilite';
import { formatMonthYear } from '@/lib/dates';

// Paramètres de la rentabilité (lot 7) : valeurs par défaut (pas
// d'expert-comptable), modifiables par le CFO seul, au 1er d'un mois, à
// partir du mois en cours — un mois passé ne se réécrit pas. Lecture pour
// le CEO et le CTO.
export function ParametresRentabilite({ slug, onClose }: { slug: string; onClose: (modifie: boolean) => void }) {
  const [p, setP] = useState<Parametres | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [cle, setCle] = useState('heures_annuelles');
  const [valeur, setValeur] = useState('');
  const [desactive, setDesactive] = useState(false);
  const [mois, setMois] = useState('');
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [modifie, setModifie] = useState(false);

  useEffect(() => {
    getParametresRentabilite(slug)
      .then((x) => {
        setP(x);
        setMois(x.premierMois.slice(0, 7));
      })
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Paramètres indisponibles.'));
  }, [slug]);
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && !envoi && onClose(modifie);
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose, envoi, modifie]);

  const def = p?.definitions[cle];
  const nombre = Number(valeur.replace(',', '.'));

  async function enregistrer() {
    setEnvoi(true);
    setErreur(null);
    try {
      setP(
        await modifierParametreRentabilite(slug, {
          cle,
          valeur: desactive ? null : nombre,
          dateEffet: `${mois}-01`,
          motif: motif.trim(),
        }),
      );
      setModifie(true);
      setValeur('');
      setMotif('');
      setDesactive(false);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={() => !envoi && onClose(modifie)}>
      <div
        className="modal rtp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rtp-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="rtp-titre">Paramètres de la rentabilité</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Fermer"
            disabled={envoi}
            onClick={() => onClose(modifie)}
          >
            <X size={18} />
          </button>
        </header>
        <div className="modal-body rtp-corps">
          <p className="dmd-note">
            Valeurs par défaut, non validées par un expert-comptable. Seul le CFO les modifie ; une nouvelle valeur
            s’applique à partir du mois choisi et ne réécrit jamais un mois passé.
          </p>
          {!p && !erreur && <p className="dmd-note">Chargement…</p>}
          {p && (
            <>
              <dl className="rtf-synthese">
                {p.enVigueur.map((x) => (
                  <div key={x.cle}>
                    <dt>{x.libelle}</dt>
                    <dd>
                      {formatParametre(x)}
                      {x.parDefaut && <span className="pill pill--neutre">par défaut</span>}
                    </dd>
                  </div>
                ))}
              </dl>

              {p.peutModifier && def && (
                <div className="rtp-form">
                  <p className="field-label">Nouvelle valeur</p>
                  <div className="rtp-champs">
                    <label className="field">
                      <span className="field-label">Paramètre</span>
                      <select
                        className="field-input"
                        value={cle}
                        disabled={envoi}
                        onChange={(e) => {
                          setCle(e.target.value);
                          setDesactive(false);
                        }}
                      >
                        {Object.entries(p.definitions).map(([k, d]) => (
                          <option key={k} value={k}>
                            {d.libelle}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">
                        Valeur ({def.unite}, de {def.min} à {def.max})
                      </span>
                      <input
                        className="field-input"
                        inputMode="decimal"
                        value={valeur}
                        disabled={envoi || desactive}
                        onChange={(e) => setValeur(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">À partir de</span>
                      <input
                        className="field-input"
                        type="month"
                        min={p.premierMois.slice(0, 7)}
                        value={mois}
                        disabled={envoi}
                        onChange={(e) => setMois(e.target.value)}
                      />
                    </label>
                  </div>
                  {def.videPermis && (
                    <label className="rtp-vide">
                      <input
                        type="checkbox"
                        checked={desactive}
                        disabled={envoi}
                        onChange={(e) => setDesactive(e.target.checked)}
                      />{' '}
                      {cle === 'coefficient_charges'
                        ? 'Désactiver (charges non comprises)'
                        : 'Vider (pas de couleur de statut)'}
                    </label>
                  )}
                  <label className="field">
                    <span className="field-label">Motif (obligatoire)</span>
                    <input
                      className="field-input"
                      value={motif}
                      maxLength={300}
                      disabled={envoi}
                      onChange={(e) => setMotif(e.target.value)}
                    />
                  </label>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={
                        envoi ||
                        motif.trim().length < 3 ||
                        !mois ||
                        (!desactive && (!valeur || !Number.isFinite(nombre)))
                      }
                      onClick={enregistrer}
                    >
                      {envoi ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              )}

              <h3 className="fiche-crm-titre">Historique</h3>
              {p.historique.length === 0 ? (
                <p className="dmd-note">Aucune modification : toutes les valeurs sont celles par défaut.</p>
              ) : (
                <ul className="rtf-mois">
                  {p.historique.map((h, i) => (
                    <li key={`${h.cle}-${h.le}-${i}`}>
                      <span className="rtf-mois-nom">{h.libelle}</span>
                      <span>
                        {formatParametre({ valeur: h.valeur, unite: p.definitions[h.cle]?.unite ?? '', cle: h.cle })}
                      </span>
                      <span>dès {formatMonthYear(h.dateEffet)}</span>
                      <span className="cell-sub">
                        {h.motif}
                        {h.par ? ` · ${h.par}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {erreur && <p className="field-erreur">{erreur}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
