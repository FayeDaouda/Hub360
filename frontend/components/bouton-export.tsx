'use client';

import { FileSpreadsheet } from 'lucide-react';

// Bouton « Exporter (Excel) » des listes — cf. lib/export-csv.ts.
export function BoutonExport({ onExporter, desactive = false }: { onExporter: () => void; desactive?: boolean }) {
  return (
    <button type="button" className="btn-ghost btn-ghost--sm bouton-export" onClick={onExporter} disabled={desactive}>
      <FileSpreadsheet size={14} aria-hidden /> Exporter (Excel)
    </button>
  );
}
