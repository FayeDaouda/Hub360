'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/client-api';
import {
  demanderAttestation,
  telechargerAttestation,
  telechargerBulletin,
  telechargerDocument,
} from '@/lib/mon-espace';

import type { ProfilMonEspace, TypePieceDossier } from '@/lib/types';
import { formatDate, formatMonthYear, yearOf } from '@hub/domain';
import { FieldError } from '@/components/ui/field';

// Libellés de la maquette (« Contrat de travail », « Fiche de poste »).
const LIBELLE_DOCUMENT: Partial<Record<TypePieceDossier, string>> = {
  contrat_signe: 'Contrat de travail',
  fiche_poste: 'Fiche de poste',
};

// « Mon espace » · Mes documents (maquette du boss) : contrat et poste
// déposés par la RH, bulletins de paie, et attestations de travail sur demande
// (délivrées par la RH).
export function MesDocuments({
  slug,
  dossier,
  onMaj,
}: {
  slug: string;
  dossier: ProfilMonEspace;
  onMaj: (d: ProfilMonEspace) => void;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const telecharger = (action: () => Promise<void>) => {
    setErreur(null);
    action().catch((e) => setErreur(e instanceof ApiError ? e.message : 'Téléchargement impossible.'));
  };

  async function demander() {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await demanderAttestation(slug);
      if (r.dossier) onMaj(r.dossier);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Demande non envoyée.');
    } finally {
      setEnvoi(false);
    }
  }

  const annee = yearOf();
  const bulletinsAnnee = dossier.bulletins.filter((b) => b.mois.startsWith(String(annee))).length;
  const documents = dossier.documents.filter((d) => d.ajouteLe);
  const enAttente = dossier.attestations.find((a) => !a.delivreeLe);
  const delivrees = dossier.attestations.filter((a) => a.delivreeLe);

  const ligne = (
    cle: string,
    titre: string,
    depose: string,
    teinte: 'contrat' | 'bulletin',
    action: () => Promise<void>,
  ) => (
    <li key={cle} className="me-doc">
      <span className={`me-doc-pdf me-doc-pdf--${teinte}`} aria-hidden>
        PDF
      </span>
      <span className="me-doc-texte">
        <strong>{titre}</strong>
        <span className="cell-sub">déposé le {formatDate(depose)}</span>
      </span>
      <button type="button" className="me-doc-lien" onClick={() => telecharger(action)}>
        Télécharger
      </button>
    </li>
  );

  return (
    <>
      {erreur && <FieldError>{erreur}</FieldError>}
      <div className="me-documents">
        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Contrat et poste</h2>
          <p className="dmd-note">Déposés par la RH.</p>
          {documents.length === 0 ? (
            <p className="dmd-note">Aucun document déposé pour l’instant.</p>
          ) : (
            <ul className="me-docs">
              {documents.map((d) =>
                ligne(d.type, LIBELLE_DOCUMENT[d.type] ?? d.type, d.ajouteLe!, 'contrat', () =>
                  telechargerDocument(slug, d.type),
                ),
              )}
            </ul>
          )}
        </section>

        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Bulletins de paie</h2>
          <p className="dmd-note">
            {bulletinsAnnee} bulletin(s) en {annee}
          </p>
          {dossier.bulletins.length > 0 && (
            <ul className="me-docs">
              {dossier.bulletins.map((b) =>
                ligne(b.mois, `Bulletin · ${formatMonthYear(b.mois)}`, b.deposeLe, 'bulletin', () =>
                  telechargerBulletin(slug, b.mois),
                ),
              )}
            </ul>
          )}
        </section>

        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Attestations</h2>
          <p className="dmd-note">Attestation de travail sur demande, délivrée par la RH.</p>
          {delivrees.length > 0 && (
            <ul className="me-docs">
              {delivrees.map((a) =>
                ligne(a.id, 'Attestation de travail', a.delivreeLe!, 'contrat', () =>
                  telechargerAttestation(slug, a.id),
                ),
              )}
            </ul>
          )}
          {enAttente ? (
            <p className="me-attente">Demandée le {formatDate(enAttente.demandeLe)} · la RH la prépare.</p>
          ) : (
            <button type="button" className="btn-ghost me-envoyer" disabled={envoi} onClick={demander}>
              Demander une attestation de travail
            </button>
          )}
        </section>
      </div>
    </>
  );
}
