'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { todayIso, VALIDITE_OFFRE_JOURS } from '@hub/domain';
import { ACTIONS_CRM } from '@/lib/cycle-crm';
import { getDevis } from '@/lib/devis';
import { documentApercuOffre } from '@/lib/document-devis';
import { useSocieteCourante } from '@/lib/layout-contexte';
import type { Devis } from '@/lib/types';
import { DocumentFacturation } from '@/components/document-facturation';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';

type Props = {
  slug: string;
  offreId: string;
  dossierCode: string;
  // Le lecteur peut trancher (CFO, ou CEO au-delà du seuil) : boutons de
  // décision en bas du document. Sinon, simple consultation.
  decision: {
    onValider: () => Promise<void>; // rejet = l'erreur s'affiche, l'aperçu reste ouvert
    onRenvoyer?: () => void; // passe au renvoi (commentaire obligatoire, dans la fiche)
  } | null;
  onClose: () => void;
};

// Aperçu de l'offre AVANT son envoi (09/11/2026) : le CFO la lit telle que
// le client la recevra, puis la valide en bas du document — l'envoi passe
// obligatoirement par cet aperçu. Fenêtre au premier plan, rendue hors du
// tiroir de la fiche (portail). Clavier comme la confirmation : focus dans
// la fenêtre à l'ouverture (rendu au bouton d'origine à la fermeture),
// tabulation piégée, Échap intercepté à la capture — il ferme l'aperçu seul,
// jamais la fiche en dessous, et rien pendant l'envoi.
export function ApercuOffre({ slug, offreId, dossierCode, decision, onClose }: Props) {
  const societe = useSocieteCourante();
  const [devis, setDevis] = useState<Devis | null | undefined>(undefined);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const origine = document.activeElement as HTMLElement | null;
    boite.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    return () => origine?.focus?.();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (!enCours) onClose();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enCours, onClose]);

  useEffect(() => {
    let annule = false;
    getDevis(slug, offreId)
      .then((d) => {
        if (!annule) setDevis(d);
      })
      .catch(() => {
        if (!annule) setDevis(null);
      });
    return () => {
      annule = true;
    };
  }, [slug, offreId]);

  async function valider() {
    if (!decision) return;
    setEnCours(true);
    setErreur(null);
    try {
      await decision.onValider();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’envoi a échoué.');
      setEnCours(false);
    }
  }

  const doc = devis && societe ? documentApercuOffre(devis, societe, todayIso()) : null;

  return (
    <Modal
      onClose={onClose}
      busy={enCours}
      closeOnEscape={false}
      trapFocus
      boxRef={boite}
      portal
      labelledBy="apercu-offre-titre"
      className="modal--large apercu-offre"
      backdropClassName="modal-backdrop--premier-plan"
    >
      <ModalHeader
        title={`Offre ${dossierCode} · aperçu avant envoi`}
        titleId="apercu-offre-titre"
        onClose={onClose}
        closeDisabled={enCours}
      />
      <div className="modal-body" aria-busy={devis === undefined}>
        <p className="field-aide">
          L’offre telle que le client la recevra, datée du jour de l’envoi et valable {VALIDITE_OFFRE_JOURS} jours à
          partir de l’envoi.
        </p>

        {devis === undefined && <div className="apercu-offre-chargement skeleton" aria-hidden />}
        {(devis === null || (devis && !societe)) && (
          <FieldError>Impossible d’afficher l’offre. Ferme puis réessaie.</FieldError>
        )}
        {doc && (
          <div className="fac-document">
            <DocumentFacturation {...doc} />
          </div>
        )}

        {decision && (
          <>
            <p className="field-aide">{ACTIONS_CRM.valider.consequence}</p>
            {erreur && <FieldError>{erreur}</FieldError>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={onClose} disabled={enCours}>
                Fermer
              </button>
              {decision.onRenvoyer && (
                <button type="button" className="btn-ghost" onClick={decision.onRenvoyer} disabled={enCours}>
                  Renvoyer…
                </button>
              )}
              {/* Pas d'envoi sans document affiché : l'aperçu est le passage obligé. */}
              <button type="button" className="btn-primary" onClick={valider} disabled={enCours || !doc}>
                <Send size={14} aria-hidden /> {enCours ? 'Envoi…' : 'Valider et envoyer l’offre'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
