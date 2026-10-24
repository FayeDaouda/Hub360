'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/client-api';

// Pied de section des Réglages : aucune modification sans motif (maquette du
// boss). Le motif entre au journal avec chaque valeur modifiée. Tant qu'il y
// a des modifications en attente, la barre reste collée en bas de l'écran.
export function BarreMotif({
  nombre,
  placeholder = 'Motif de la modification (obligatoire)',
  onAnnuler,
  onEnregistrer,
}: {
  nombre: number; // modifications en attente
  placeholder?: string;
  onAnnuler: () => void;
  onEnregistrer: (motif: string) => Promise<void>;
}) {
  const [motif, setMotif] = useState('');
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });
  const pret = nombre > 0 && motif.trim().length >= 3 && !etat.envoi;

  async function enregistrer() {
    setEtat({ envoi: true, erreur: null });
    try {
      await onEnregistrer(motif.trim());
      setMotif('');
      setEtat({ envoi: false, erreur: null });
    } catch (e) {
      setEtat({ envoi: false, erreur: e instanceof ApiError ? e.message : 'Enregistrement impossible.' });
    }
  }

  return (
    <div className={`reg-motif${nombre > 0 ? ' reg-motif--actif' : ''}`}>
      {etat.erreur && <p className="field-erreur">{etat.erreur}</p>}
      <div className="reg-motif-ligne">
        <input
          className="field-input"
          maxLength={500}
          placeholder={placeholder}
          aria-label="Motif de la modification"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
        />
        <button type="button" className="btn-ghost" disabled={nombre === 0 || etat.envoi} onClick={onAnnuler}>
          Annuler<span className="masque-mobile"> les modifications</span>
        </button>
        <button type="button" className="btn-primary" disabled={!pret} onClick={enregistrer} title={nombre > 0 && !motif.trim() ? 'Motif obligatoire' : undefined}>
          {etat.envoi ? (
            'Enregistrement…'
          ) : nombre === 0 ? (
            'Aucune modification'
          ) : (
            <>
              Enregistrer · {nombre}
              <span className="masque-mobile"> modification{nombre > 1 ? 's' : ''}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
