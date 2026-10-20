'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { creerAvoir, LIBELLE_MOTIF_AVOIR, type MotifAvoir } from '@/lib/facturation';
import { formatMontant } from '@/lib/format';
import type { Facturation } from '@/lib/types';

// Demande d'avoir (contrôle interne, revue CFO 20/10/2026) : motif choisi et
// précisé, CEO prévenu ; au-delà du seuil (Réglages), le CEO valide avant
// l'émission et la facture reste émise d'ici là.
export function DemandeAvoir({
  slug,
  projetId,
  facture,
  onFait,
  onClose,
}: {
  slug: string;
  projetId: string;
  facture: { id: string; reference: string | null; montantTtc: number };
  onFait: (f: Facturation) => void;
  onClose: () => void;
}) {
  const [motif, setMotif] = useState<MotifAvoir | ''>('');
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enAttente, setEnAttente] = useState(false);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && !envoi && onClose();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose, envoi]);

  async function envoyer() {
    if (!motif) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const f = await creerAvoir(slug, projetId, facture.id, { motif, commentaire: commentaire.trim() });
      onFait(f);
      // Toujours émise : au-delà du seuil, la demande attend le CEO.
      if (f.factures.find((x) => x.id === facture.id)?.statut === 'emise') setEnAttente(true);
      else onClose();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Demande impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={() => !envoi && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="da-titre" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="da-titre">Avoir sur {facture.reference ?? 'la facture'}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" disabled={envoi} onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="modal-body da-corps">
          {enAttente ? (
            <>
              <p className="dmd-note">
                Demande envoyée au CEO : au-delà du seuil, il valide l’avoir avant son émission. La facture reste émise d’ici là ; vous serez
                prévenu de sa décision.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn-primary" onClick={onClose}>
                  Fermer
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="dmd-note">
                L’avoir annule toute la facture ({formatMontant(facture.montantTtc)} TTC). Le motif est obligatoire et le CEO est prévenu ; au-delà
                du seuil fixé dans Réglages, il valide avant l’émission.
              </p>
              <label className="field">
                <span className="field-label">Motif</span>
                <select className="field-input" value={motif} disabled={envoi} onChange={(e) => setMotif(e.target.value as MotifAvoir)}>
                  <option value="">— choisir —</option>
                  {(Object.keys(LIBELLE_MOTIF_AVOIR) as MotifAvoir[]).map((m) => (
                    <option key={m} value={m}>
                      {LIBELLE_MOTIF_AVOIR[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Précisez (transmis au CEO)</span>
                <textarea
                  className="field-input"
                  rows={3}
                  maxLength={500}
                  value={commentaire}
                  disabled={envoi}
                  placeholder="Ex. taux de TVA erroné, à refacturer à 18 %"
                  onChange={(e) => setCommentaire(e.target.value)}
                />
              </label>
              {erreur && <p className="field-erreur">{erreur}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" disabled={envoi} onClick={onClose}>
                  Annuler
                </button>
                <button type="button" className="btn-primary" disabled={envoi || !motif || commentaire.trim().length < 5} onClick={envoyer}>
                  {envoi ? 'Envoi…' : 'Demander l’avoir'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
