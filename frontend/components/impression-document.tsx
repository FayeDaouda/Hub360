'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DocumentFacturation, type DocumentFacturationProps } from './document-facturation';

// Impression d'un devis/facture depuis une page admin qui a par ailleurs sa
// propre UI (sidebar, tableaux…) — portal direct sur body + CSS d'impression
// qui masque tout le reste (cf. globals.css #impression-document), même
// motif que le portail d'info-bulle de admin-shell.tsx. `doc` passe à
// non-null → impression déclenchée ; `onImprime` reprend la main une fois la
// boîte de dialogue navigateur refermée (annulée ou « Enregistrer en PDF »).
export function ImpressionDocument({
  doc,
  onImprime,
}: {
  doc: DocumentFacturationProps | null;
  onImprime: () => void;
}) {
  useEffect(() => {
    if (!doc) return;
    const id = setTimeout(() => window.print(), 60);
    window.addEventListener('afterprint', onImprime);
    return () => {
      clearTimeout(id);
      window.removeEventListener('afterprint', onImprime);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  if (!doc) return null;
  return createPortal(
    <div id="impression-document">
      <DocumentFacturation {...doc} />
    </div>,
    document.body,
  );
}
