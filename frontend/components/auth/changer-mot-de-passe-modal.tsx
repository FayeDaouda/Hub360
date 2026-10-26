'use client';

import { useState } from 'react';
import { remplacerSession } from '@/lib/auth';
import { apiAuth } from '@/lib/client-api';
import type { Session } from '@/lib/types';
import { DoubleFacteurCompte } from './double-facteur-compte';
import { Modal, ModalHeader } from '@/components/ui/dialog';

// « Mon compte » (initiales de la barre du haut) : changement du mot de
// passe (phase 0, 13/10/2026) et double authentification (19/10/2026).
// Le serveur coupe les autres sessions et renvoie une session neuve, qui
// remplace l'actuelle : on reste connecté sur ce poste.
export function ChangerMotDePasseModal({ onClose }: { onClose: () => void }) {
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirme, setConfirme] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fait, setFait] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (nouveau.length < 10) return setErreur('Au moins 10 caractères.');
    if (nouveau !== confirme) return setErreur('Les deux saisies ne correspondent pas.');
    setBusy(true);
    try {
      const session = await apiAuth<Session>('/auth/mot-de-passe', {
        method: 'POST',
        body: { actuel, nouveau },
      });
      remplacerSession(session);
      setFait(true);
    } catch (err) {
      setErreur(err instanceof Error && err.message ? err.message : 'Changement impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} closeOnEscape={false} className="modal--sm" labelledBy="modal-titre-mdp">
      <ModalHeader title="Mon compte" titleId="modal-titre-mdp" onClose={onClose} />

      <div className="modal-body">
        <h3 className="mon-compte-titre">Mot de passe</h3>
        {fait ? (
          <>
            <p>Mot de passe changé. Vos autres appareils devront se reconnecter.</p>
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={soumettre} style={{ display: 'grid', gap: '0.85rem' }}>
            <label className="field">
              <span className="field-label">Mot de passe actuel</span>
              <input
                type="password"
                className="field-input"
                autoComplete="current-password"
                value={actuel}
                onChange={(e) => setActuel(e.target.value)}
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Nouveau mot de passe</span>
              <input
                type="password"
                className="field-input"
                autoComplete="new-password"
                placeholder="Au moins 10 caractères"
                minLength={10}
                maxLength={72}
                value={nouveau}
                onChange={(e) => setNouveau(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Confirmer le nouveau mot de passe</span>
              <input
                type="password"
                className="field-input"
                autoComplete="new-password"
                maxLength={72}
                value={confirme}
                onChange={(e) => setConfirme(e.target.value)}
                required
              />
            </label>
            {erreur && (
              <p className="field-erreur" role="alert">
                {erreur}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={onClose}>
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Changer'}
              </button>
            </div>
          </form>
        )}
        <h3 className="mon-compte-titre mon-compte-titre--suite">Double authentification</h3>
        <DoubleFacteurCompte />
      </div>
    </Modal>
  );
}
