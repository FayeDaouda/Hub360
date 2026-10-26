'use client';

import { useEffect, useState } from 'react';
import { Mail, Phone } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { getFicheContact, type FicheContact } from '@/lib/contacts';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';

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

  const nom = fiche ? `${fiche.prenom} ${fiche.nom}`.trim() : 'Contact';
  return (
    <Modal onClose={onClose} portal className="modal--sm" labelledBy="fiche-contact-titre">
      <ModalHeader title={nom} titleId="fiche-contact-titre" onClose={onClose} />
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
              {fiche.estChef && (
                <Pill tone="info" className="fc-chef">
                  Chef de team
                </Pill>
              )}
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
    </Modal>
  );
}
