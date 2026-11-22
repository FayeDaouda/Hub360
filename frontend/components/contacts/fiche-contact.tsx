'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookUser } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { ouvrirConversation, ouvrirDirect } from '@/lib/chat';
import { getFicheContact, type FicheContact } from '@/lib/contacts';
import { FicheCollegue } from '@/components/annuaire/fiche-collegue';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';

// Fiche contact d'un collègue (revue Salarié 19/10/2026) : ouverte depuis la
// recherche (Ctrl+K) et l'annuaire du chat. Depuis l'Annuaire (22/11/2026),
// c'est la même fiche que dans l'annuaire, avec ses actions directes et un
// lien pour l'y retrouver.
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

  async function ecrire() {
    try {
      const canal = await ouvrirDirect(slug, utilisateurId);
      onClose();
      ouvrirConversation(canal.id);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'La conversation n’a pas pu s’ouvrir.');
    }
  }

  return (
    <Modal onClose={onClose} portal className="modal--sm fiche-contact" labelledBy="fiche-contact-titre">
      <div className="annuaire-panneau-tete">
        <CloseButton onClick={onClose} />
      </div>
      <div className="modal-body">
        {erreur && <FieldError>{erreur}</FieldError>}
        {!fiche && !erreur && <Skeleton />}
        {fiche && (
          <>
            <FicheCollegue p={fiche} titreId="fiche-contact-titre" onEcrire={ecrire} />
            <Link
              className="lien-inline fiche-contact-annuaire"
              href={`/admin/${slug}/annuaire?personne=${utilisateurId}`}
            >
              <BookUser size={15} aria-hidden /> Ouvrir dans l’annuaire
            </Link>
          </>
        )}
      </div>
    </Modal>
  );
}
