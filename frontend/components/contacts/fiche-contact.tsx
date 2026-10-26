'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mail, Phone, X } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { getFicheContact, type FicheContact } from '@/lib/contacts';

// Fiche contact d'un collègue (revue Salarié 19/10/2026) : ouverte depuis la
// recherche (Ctrl+K) et l'annuaire du chat — remplace la page Équipes comme
// annuaire pour le Salarié.
export function FicheContactModal({
  slug,
  utilisateurId,
  onClose,
}: {
  slug: string;
  utilisateurId: string;
  onClose: () => void;
}) {
  const [fiche, setFiche] = useState<FicheContact | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getFicheContact(slug, utilisateurId)
      .then(setFiche)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Fiche indisponible.'));
  }, [slug, utilisateurId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nom = fiche ? `${fiche.prenom} ${fiche.nom}`.trim() : 'Contact';
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fiche-contact-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="fiche-contact-titre">{nom}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">
          {erreur && <p className="field-erreur">{erreur}</p>}
          {!fiche && !erreur && <div className="skeleton admin-skeleton-panel" aria-hidden />}
          {fiche && (
            <dl className="fc-liste">
              <dt>Poste</dt>
              <dd>{fiche.poste ?? '—'}</dd>
              <dt>Cellule</dt>
              <dd>
                {fiche.cellule ?? 'Sans cellule'}
                {fiche.estChef && <span className="pill pill--info fc-chef">Chef de team</span>}
              </dd>
              {fiche.chef && (
                <>
                  <dt>Chef de team</dt>
                  <dd>{fiche.chef}</dd>
                </>
              )}
              <dt>Téléphone</dt>
              <dd>
                {fiche.telephone ? (
                  <a className="lien-inline fc-lien" href={`tel:${fiche.telephone.replace(/\s+/g, '')}`}>
                    <Phone size={14} aria-hidden /> {fiche.telephone}
                  </a>
                ) : (
                  'Non renseigné'
                )}
              </dd>
              <dt>E-mail</dt>
              <dd>
                <a className="lien-inline fc-lien" href={`mailto:${fiche.email}`}>
                  <Mail size={14} aria-hidden /> {fiche.email}
                </a>
              </dd>
            </dl>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
