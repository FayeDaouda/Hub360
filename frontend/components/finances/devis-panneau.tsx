'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Copy, Download, ReceiptText, Send, XCircle } from 'lucide-react';
import { convertirDevis, envoyerDevis, marquerReponseDevis, supprimerDevis } from '@/lib/devis';
import { lienFacturationProjet } from '@/lib/facturation';
import { statutDevis } from '@/lib/finances';
import type { Devis } from '@/lib/types';
import { DocumentFacturation, type DocumentFacturationProps } from '@/components/document-facturation';
import { useConfirmer } from '@/components/confirmation';
import { formatDate } from '@hub/domain';
import { CloseButton, Drawer } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';
import { FieldError } from '@/components/ui/field';

type Props = {
  slug: string;
  devis: Devis;
  document: DocumentFacturationProps | null;
  droits: { devisEcriture: boolean; devisValidation: boolean; facturesEcriture: boolean };
  onMaj: () => void; // recharge les listes
  onClose: () => void;
  onTelecharger: () => void;
};

// Devis en panneau latéral (Finances) : document et gestes selon le statut.
// Une offre de dossier se prépare et se soumet au CFO depuis le CRM (lien) ;
// un devis libre s'envoie, se marque accepté ou refusé, puis se convertit.
export function DevisPanneau({ slug, devis: d, document, droits, onMaj, onClose, onTelecharger }: Props) {
  const confirmer = useConfirmer();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lien, setLien] = useState<{ url: string; emailEnvoye: boolean } | null>(null);
  const s = statutDevis(d);

  async function agir(fn: () => Promise<unknown>, apres?: () => void) {
    setEnCours(true);
    setErreur(null);
    try {
      await fn();
      onMaj();
      apres?.();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’action a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Drawer onClose={onClose} as="aside" labelledBy="fp-devis">
      <header className="fiche-crm-entete">
        <div>
          <p className="fiche-crm-titre">{d.dossierCrm ? 'Offre commerciale' : 'Devis'}</p>
          <h2 id="fp-devis" className="fiche-crm-code fac-titre">
            {d.reference ?? 'Brouillon'}
            <Pill tone={s.ton}>{s.libelle}</Pill>
          </h2>
          <p className="fiche-crm-meta">
            {[
              d.client.nom,
              d.dossierCrm?.code,
              `créé le ${formatDate(d.creeLe)}`,
              d.dateValidite && `valable jusqu’au ${formatDate(d.dateValidite)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      {d.dossierCrm && d.statut === 'brouillon' && (
        <div className="fiche-crm-alerte" role="note">
          <strong>
            {d.dossierCrm.statut === 'en_validation'
              ? `Offre du lead ${d.dossierCrm.code} soumise au CFO : sa validation, depuis la fiche du CRM, l’envoie au client.`
              : `Offre du lead ${d.dossierCrm.code} : elle ne se modifie qu’en « Nouveau projet ».`}
          </strong>
          <Link className="lien-inline" href={`/admin/${slug}/crm?dossier=${d.dossierCrm.id}`}>
            Ouvrir la fiche CRM
          </Link>
        </div>
      )}

      {lien && (
        <div className="crm-banner" role="status">
          <span>
            {lien.emailEnvoye
              ? 'Devis envoyé par e-mail au client.'
              : 'E-mail non envoyé : transmettez le lien au client.'}{' '}
            <code>{lien.url}</code>
          </span>
          <button type="button" className="lien-inline" onClick={() => navigator.clipboard?.writeText(lien.url)}>
            <Copy size={12} aria-hidden /> Copier
          </button>
        </div>
      )}

      {document && (
        <div className="fac-document">
          <DocumentFacturation {...document} />
        </div>
      )}

      {erreur && <FieldError>{erreur}</FieldError>}
      <div className="fac-actions">
        {!d.dossierCrm && d.statut === 'brouillon' && droits.devisValidation && (
          <button
            type="button"
            className="btn-primary"
            disabled={enCours}
            onClick={() =>
              agir(async () => {
                const r = await envoyerDevis(slug, d.id);
                setLien({ url: r.lienPublic, emailEnvoye: r.emailEnvoye });
              })
            }
          >
            <Send size={14} aria-hidden /> Envoyer
          </button>
        )}
        {d.statut === 'envoye' && droits.devisEcriture && (
          <>
            <button
              type="button"
              className="btn-ghost"
              disabled={enCours}
              onClick={() => agir(() => marquerReponseDevis(slug, d.id, 'accepte'))}
            >
              <CheckCircle2 size={14} aria-hidden /> Accepté
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={enCours}
              onClick={() => agir(() => marquerReponseDevis(slug, d.id, 'refuse'))}
            >
              <XCircle size={14} aria-hidden /> Refusé
            </button>
          </>
        )}
        {d.statut === 'accepte' && !d.dossierCrm && droits.facturesEcriture && (
          <button
            type="button"
            className="btn-ghost"
            disabled={enCours}
            onClick={async () =>
              (await confirmer({
                titre: 'Convertir ce devis en facture ?',
                message: 'La facture est émise tout de suite, avec un numéro définitif.',
                confirmer: 'Convertir',
              })) && agir(() => convertirDevis(slug, d.id), onClose)
            }
          >
            <ReceiptText size={14} aria-hidden /> Convertir en facture
          </button>
        )}
        {!d.dossierCrm && d.statut === 'brouillon' && droits.devisEcriture && (
          <button
            type="button"
            className="btn-ghost"
            disabled={enCours}
            onClick={async () =>
              (await confirmer({
                titre: 'Supprimer ce brouillon de devis ?',
                message: 'Le brouillon de devis sera supprimé.',
                confirmer: 'Supprimer',
                danger: true,
              })) && agir(() => supprimerDevis(slug, d.id), onClose)
            }
          >
            Supprimer le brouillon
          </button>
        )}
        {d.projetId && (d.statut === 'accepte' || d.statut === 'transforme') && droits.facturesEcriture && (
          <Link className="btn-primary" href={lienFacturationProjet(slug, d.projetId)}>
            <ReceiptText size={14} aria-hidden /> Facturer les tranches
          </Link>
        )}
        <button type="button" className="btn-ghost" onClick={onTelecharger}>
          <Download size={14} aria-hidden /> Télécharger
        </button>
      </div>
    </Drawer>
  );
}
