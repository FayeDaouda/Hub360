'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Download, XCircle } from 'lucide-react';
import { getDevisPublic, repondreDevisPublic } from '@/lib/devis';
import { STATUTS_DEVIS, type DevisPublic, type StatutDevisEffectif } from '@/lib/types';
import { DocumentFacturation } from '@/components/document-facturation';
import { useConfirmer } from '@/components/confirmation';

type Props = { params: { token: string } };

const MESSAGE_STATUT: Partial<Record<DevisPublic['statutEffectif'], (d: DevisPublic) => string>> = {
  accepte: (d) => `Vous avez accepté ce devis${d.dateReponse ? ` le ${formatDate(d.dateReponse)}` : ''}.`,
  refuse: (d) => `Vous avez refusé ce devis${d.dateReponse ? ` le ${formatDate(d.dateReponse)}` : ''}.`,
  transforme: () => 'Ce devis a été accepté et transformé en facture.',
  expire: (d) =>
    `Ce devis a expiré${d.dateValidite ? ` le ${formatDate(d.dateValidite)}` : ''} — contactez-nous pour en obtenir un nouveau.`,
};

const PILL_DEVIS: Record<StatutDevisEffectif, string> = {
  brouillon: 'pill--neutre',
  envoye: 'pill--info',
  accepte: 'pill--succes',
  refuse: 'pill--risque',
  expire: 'pill--risque',
  transforme: 'pill--succes',
};

function formatDate(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function DevisPublicPage({ params }: Props) {
  const confirmer = useConfirmer();
  const [devis, setDevis] = useState<DevisPublic | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getDevisPublic(params.token)
      .then(setDevis)
      .catch(() => setDevis(null));
  }, [params.token]);

  async function repondre(reponse: 'accepte' | 'refuse') {
    const accepte = reponse === 'accepte';
    const ok = await confirmer({
      titre: accepte ? 'Accepter ce devis ?' : 'Refuser ce devis ?',
      message: accepte ? 'Confirmez-vous l’acceptation de ce devis ?' : 'Confirmez-vous le refus de ce devis ?',
      confirmer: accepte ? 'Accepter le devis' : 'Refuser le devis',
      danger: !accepte,
    });
    if (!ok) return;
    setBusy(true);
    setErreur(null);
    try {
      setDevis(await repondreDevisPublic(params.token, reponse));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  if (devis === undefined) {
    return (
      <main className="devis-public-page">
        <div className="devis-public-doc skeleton" style={{ height: 560 }} aria-hidden />
      </main>
    );
  }

  if (devis === null) {
    return (
      <main className="devis-public-page">
        <div className="devis-public-doc devis-public-introuvable">
          <h1>Lien invalide</h1>
          <p>Ce lien est incorrect ou a expiré. Contactez l’émetteur du devis pour en obtenir un nouveau.</p>
        </div>
      </main>
    );
  }

  const messageStatut = MESSAGE_STATUT[devis.statutEffectif]?.(devis);

  return (
    <main className="devis-public-page">
      <div className="devis-public-page-corps">
        <DocumentFacturation
          typeDocument="Devis"
          societe={devis.societe}
          reference={devis.reference}
          statutLabel={STATUTS_DEVIS[devis.statutEffectif]}
          statutClasse={PILL_DEVIS[devis.statutEffectif]}
          dateEmission={devis.dateEnvoi ? formatDate(devis.dateEnvoi) : null}
          dateValidite={devis.dateValidite ? formatDate(devis.dateValidite) : null}
          clientNom={devis.clientNom}
          objet={devis.objet}
          lignes={devis.lignes}
          montantHt={devis.montantHt}
          montantTva={devis.montantTva}
          montantTtc={devis.montantTtc}
        />

        <div className="devis-public-page-actions">
          {erreur && <p className="field-erreur">{erreur}</p>}

          {devis.peutRepondre ? (
            <div className="devis-public-actions">
              <button
                type="button"
                className="btn-ghost btn-ghost--danger"
                disabled={busy}
                onClick={() => repondre('refuse')}
              >
                <XCircle size={16} aria-hidden /> Refuser
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => repondre('accepte')}
              >
                <CheckCircle2 size={16} aria-hidden /> Accepter le devis
              </button>
            </div>
          ) : (
            messageStatut && <p className="devis-public-message">{messageStatut}</p>
          )}

          <button type="button" className="lien-inline devis-public-telecharger" onClick={() => window.print()}>
            <Download size={13} aria-hidden /> Télécharger / imprimer
          </button>
        </div>
      </div>
    </main>
  );
}
