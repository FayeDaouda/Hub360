'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { formatDate, formatMonthYear, yearOf } from '@hub/domain';
import { FieldError } from '@/components/ui/field';
import { downloadCertificate, downloadDocument, downloadPayslip, requestCertificate } from './api';
import type { EmployeeDocumentType, MyFile } from './types';

// Libellés de la maquette (« Contrat de travail », « Fiche de poste »).
const DOCUMENT_LABELS: Partial<Record<EmployeeDocumentType, string>> = {
  contrat_signe: 'Contrat de travail',
  fiche_poste: 'Fiche de poste',
};

// « Mon espace » · Mes documents (maquette du boss) : contrat et poste
// déposés par la RH, bulletins de paie, et attestations de travail sur demande
// (délivrées par la RH).
export function MyDocuments({ slug, file, onChange }: { slug: string; file: MyFile; onChange: (f: MyFile) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const download = (action: () => Promise<void>) => {
    setError(null);
    action().catch((e) => setError(e instanceof ApiError ? e.message : 'Téléchargement impossible.'));
  };

  async function askCertificate() {
    setSending(true);
    setError(null);
    try {
      const r = await requestCertificate(slug);
      if (r.dossier) onChange(r.dossier);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Demande non envoyée.');
    } finally {
      setSending(false);
    }
  }

  const year = yearOf();
  const payslipsThisYear = file.bulletins.filter((b) => b.mois.startsWith(String(year))).length;
  const documents = file.documents.filter((d) => d.ajouteLe);
  const pending = file.attestations.find((a) => !a.delivreeLe);
  const delivered = file.attestations.filter((a) => a.delivreeLe);

  const row = (
    key: string,
    title: string,
    filedAt: string,
    tint: 'contrat' | 'bulletin',
    action: () => Promise<void>,
  ) => (
    <li key={key} className="me-doc">
      <span className={`me-doc-pdf me-doc-pdf--${tint}`} aria-hidden>
        PDF
      </span>
      <span className="me-doc-texte">
        <strong>{title}</strong>
        <span className="cell-sub">déposé le {formatDate(filedAt)}</span>
      </span>
      <button type="button" className="me-doc-lien" onClick={() => download(action)}>
        Télécharger
      </button>
    </li>
  );

  return (
    <>
      {error && <FieldError>{error}</FieldError>}
      <div className="me-documents">
        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Contrat et poste</h2>
          <p className="dmd-note">Déposés par la RH.</p>
          {documents.length === 0 ? (
            <p className="dmd-note">Aucun document déposé pour l’instant.</p>
          ) : (
            <ul className="me-docs">
              {documents.map((d) =>
                row(d.type, DOCUMENT_LABELS[d.type] ?? d.type, d.ajouteLe!, 'contrat', () =>
                  downloadDocument(slug, d.type),
                ),
              )}
            </ul>
          )}
        </section>

        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Bulletins de paie</h2>
          <p className="dmd-note">
            {payslipsThisYear} bulletin(s) en {year}
          </p>
          {file.bulletins.length > 0 && (
            <ul className="me-docs">
              {file.bulletins.map((b) =>
                row(b.mois, `Bulletin · ${formatMonthYear(b.mois)}`, b.deposeLe, 'bulletin', () =>
                  downloadPayslip(slug, b.mois),
                ),
              )}
            </ul>
          )}
        </section>

        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Attestations</h2>
          <p className="dmd-note">Attestation de travail sur demande, délivrée par la RH.</p>
          {delivered.length > 0 && (
            <ul className="me-docs">
              {delivered.map((a) =>
                row(a.id, 'Attestation de travail', a.delivreeLe!, 'contrat', () => downloadCertificate(slug, a.id)),
              )}
            </ul>
          )}
          {pending ? (
            <p className="me-attente">Demandée le {formatDate(pending.demandeLe)} · la RH la prépare.</p>
          ) : (
            <button type="button" className="btn-ghost me-envoyer" disabled={sending} onClick={askCertificate}>
              Demander une attestation de travail
            </button>
          )}
        </section>
      </div>
    </>
  );
}
