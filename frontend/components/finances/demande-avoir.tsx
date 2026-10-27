'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { creerAvoir, LIBELLE_MOTIF_AVOIR, type MotifAvoir } from '@/lib/facturation';
import { formatAmount } from '@hub/domain';
import type { Facturation } from '@/lib/types';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';

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

  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="da-titre">
      <header className="modal-header">
        <h2 id="da-titre">Avoir sur {facture.reference ?? 'la facture'}</h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <div className="modal-body da-corps">
        {enAttente ? (
          <>
            <p className="dmd-note">
              Demande envoyée au CEO : au-delà du seuil, il valide l’avoir avant son émission. La facture reste émise
              d’ici là ; vous serez prévenu de sa décision.
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
              L’avoir annule toute la facture ({formatAmount(facture.montantTtc)} TTC). Le motif est obligatoire et le
              CEO est prévenu ; au-delà du seuil fixé dans Réglages, il valide avant l’émission.
            </p>
            <Field label="Motif">
              <select
                className="field-input"
                value={motif}
                disabled={envoi}
                onChange={(e) => setMotif(e.target.value as MotifAvoir)}
              >
                <option value="">— choisir —</option>
                {(Object.keys(LIBELLE_MOTIF_AVOIR) as MotifAvoir[]).map((m) => (
                  <option key={m} value={m}>
                    {LIBELLE_MOTIF_AVOIR[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Précisez (transmis au CEO)">
              <textarea
                className="field-input"
                rows={3}
                maxLength={500}
                value={commentaire}
                disabled={envoi}
                placeholder="Ex. taux de TVA erroné, à refacturer à 18 %"
                onChange={(e) => setCommentaire(e.target.value)}
              />
            </Field>
            {erreur && <FieldError>{erreur}</FieldError>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" disabled={envoi} onClick={onClose}>
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={envoi || !motif || commentaire.trim().length < 5}
                onClick={envoyer}
              >
                {envoi ? 'Envoi…' : 'Demander l’avoir'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
