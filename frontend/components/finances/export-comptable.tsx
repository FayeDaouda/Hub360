'use client';

import { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { dateExport, exporterCsv } from '@/lib/export-csv';
import { formatAmount } from '@/lib/format';
import { MODES_PAIEMENT, type FactureCentrale } from '@/lib/types';
import { formatMonthYear } from '@/lib/dates';
import { plural } from '@/lib/text';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';

type Vente = { f: FactureCentrale; origine: string | null };
type Encaissement = { f: FactureCentrale; date: string; montant: number; mode: string | null; reference: string };

// Export comptable générique (lot 4, revue CFO 21/10/2026) : journal des
// ventes (factures et avoirs émis dans le mois, HT / TVA / TTC) et journal
// des encaissements (paiements datés du mois), en CSV pour Excel. Format
// standard, sans plan de comptes : il s'adaptera au logiciel de la personne
// qui prépare les comptes annuels quand elle sera connue.
export function ExportComptable({ factures, onClose }: { factures: FactureCentrale[]; onClose: () => void }) {
  const moisDispo = useMemo(() => {
    const m = new Set<string>();
    for (const f of factures) {
      if (f.emiseLe) m.add(f.emiseLe.slice(0, 7));
      for (const p of f.paiements) m.add(p.date.slice(0, 7));
    }
    return [...m].sort().reverse();
  }, [factures]);
  const [mois, setMois] = useState(moisDispo[0] ?? new Date().toISOString().slice(0, 7));

  const { ventes, encaissements } = useMemo(() => {
    const parId = new Map(factures.map((f) => [f.id, f]));
    const ventes: Vente[] = factures
      .filter((f) => f.emiseLe?.startsWith(mois))
      .sort((a, b) => (a.emiseLe ?? '').localeCompare(b.emiseLe ?? '') || (a.numero ?? 0) - (b.numero ?? 0))
      .map((f) => ({ f, origine: f.factureOrigineId ? (parId.get(f.factureOrigineId)?.reference ?? null) : null }));
    const encaissements: Encaissement[] = factures
      .flatMap((f) =>
        f.paiements
          .filter((p) => p.date.startsWith(mois))
          .map((p) => ({
            f,
            date: p.date,
            montant: p.montant,
            mode: p.mode ? MODES_PAIEMENT[p.mode] : null,
            reference: p.reference,
          })),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    return { ventes, encaissements };
  }, [factures, mois]);

  const total = (l: Vente[], k: 'montantHt' | 'montantTva' | 'montantTtc') => l.reduce((t, v) => t + v.f[k], 0);
  const totalEncaisse = encaissements.reduce((t, e) => t + e.montant, 0);

  function exporterVentes() {
    const lignes: (Vente | null)[] = [...ventes, null]; // dernière ligne : total
    exporterCsv(
      `journal-ventes-${mois}`,
      [
        { titre: 'Date d’émission', valeur: (v) => (v ? dateExport(v.f.emiseLe) : 'TOTAL') },
        { titre: 'N° de pièce', valeur: (v) => v?.f.reference },
        { titre: 'Type', valeur: (v) => (v ? (v.f.estAvoir ? 'Avoir' : 'Facture') : null) },
        { titre: 'Facture d’origine', valeur: (v) => v?.origine },
        { titre: 'Client', valeur: (v) => v?.f.client?.nom },
        { titre: 'Projet / dossier', valeur: (v) => v?.f.projet?.code ?? v?.f.dossierCrm?.code },
        { titre: 'Libellé', valeur: (v) => v?.f.libelle },
        { titre: 'Montant HT (FCFA)', valeur: (v) => (v ? v.f.montantHt : total(ventes, 'montantHt')) },
        { titre: 'Taux TVA (%)', valeur: (v) => v?.f.tauxTva },
        { titre: 'TVA collectée (FCFA)', valeur: (v) => (v ? v.f.montantTva : total(ventes, 'montantTva')) },
        { titre: 'Montant TTC (FCFA)', valeur: (v) => (v ? v.f.montantTtc : total(ventes, 'montantTtc')) },
        { titre: 'Échéance', valeur: (v) => (v ? dateExport(v.f.echeanceLe) : null) },
      ],
      lignes,
    );
  }

  function exporterEncaissements() {
    const lignes: (Encaissement | null)[] = [...encaissements, null];
    exporterCsv(
      `journal-encaissements-${mois}`,
      [
        { titre: 'Date d’encaissement', valeur: (e) => (e ? dateExport(e.date) : 'TOTAL') },
        { titre: 'Facture', valeur: (e) => e?.f.reference },
        { titre: 'Client', valeur: (e) => e?.f.client?.nom },
        { titre: 'Projet / dossier', valeur: (e) => e?.f.projet?.code ?? e?.f.dossierCrm?.code },
        { titre: 'Mode de paiement', valeur: (e) => e?.mode },
        { titre: 'Référence du versement', valeur: (e) => e?.reference },
        { titre: 'Montant encaissé (FCFA)', valeur: (e) => (e ? e.montant : totalEncaisse) },
      ],
      lignes,
    );
  }

  return (
    <Modal onClose={onClose} portal className="exc-modal" labelledBy="exc-titre">
      <ModalHeader title="Export comptable" titleId="exc-titre" onClose={onClose} />
      <div className="modal-body exc-corps">
        <p className="dmd-note">
          Journaux du mois au format Excel, sans plan de comptes : à remettre à la personne qui prépare les comptes
          annuels. Le format s’adaptera à son logiciel quand il sera connu.
        </p>
        <Field label="Mois">
          <select className="field-input" value={mois} onChange={(e) => setMois(e.target.value)}>
            {moisDispo.length === 0 && <option value={mois}>{formatMonthYear(mois)}</option>}
            {moisDispo.map((m) => (
              <option key={m} value={m}>
                {formatMonthYear(m)}
              </option>
            ))}
          </select>
        </Field>
        <div className="exc-journaux">
          <div className="exc-journal">
            <p className="field-label">Journal des ventes</p>
            <p className="exc-chiffres">
              {plural(ventes.length, 'pièce')} · HT {formatAmount(total(ventes, 'montantHt'))} · TVA{' '}
              {formatAmount(total(ventes, 'montantTva'))} · TTC {formatAmount(total(ventes, 'montantTtc'))}
            </p>
            <button type="button" className="btn-ghost" disabled={!ventes.length} onClick={exporterVentes}>
              <FileSpreadsheet size={15} aria-hidden /> Télécharger
            </button>
          </div>
          <div className="exc-journal">
            <p className="field-label">Journal des encaissements</p>
            <p className="exc-chiffres">
              {plural(encaissements.length, 'encaissement')} · {formatAmount(totalEncaisse)}
            </p>
            <button
              type="button"
              className="btn-ghost"
              disabled={!encaissements.length}
              onClick={exporterEncaissements}
            >
              <FileSpreadsheet size={15} aria-hidden /> Télécharger
            </button>
          </div>
        </div>
        <p className="dmd-note">
          TVA collectée ici = TVA des factures émises dans le mois. Si elle est due à l’encaissement, le journal des
          encaissements donne la base.
        </p>
      </div>
    </Modal>
  );
}
