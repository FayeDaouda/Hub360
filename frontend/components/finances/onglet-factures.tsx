'use client';

import { useState } from 'react';
import { dansFiltreFacture, jjmmaaaa, libelleMois, parMois, payeeLe, statutFacture, type FiltreFacture } from '@/lib/finances';
import { formatMontant } from '@/lib/format';
import { dateExport, exporterCsv } from '@/lib/export-csv';
import { BoutonExport } from '@/components/bouton-export';
import { useHautMesure } from './use-haut-mesure';
import type { FactureCentrale } from '@/lib/types';

const FILTRES: { cle: FiltreFacture; libelle: string }[] = [
  { cle: 'tout', libelle: 'Tout' },
  { cle: 'non_payees', libelle: 'Non payées' },
  { cle: 'en_retard', libelle: 'En retard' },
  { cle: 'encaissees', libelle: 'Encaissées' },
];

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Finances · Factures (maquette) : filtres, factures groupées par mois de
// création avec le total TTC du mois, encaissé et barre de progression ; une
// ligne ouvre la facture.
export function OngletFactures({
  factures,
  onOuvrir,
  filtreInitial = 'tout',
}: {
  factures: FactureCentrale[];
  onOuvrir: (f: FactureCentrale) => void;
  filtreInitial?: FiltreFacture; // ?filtre= (tuile « En retard de paiement » du Pilotage)
}) {
  const [filtre, setFiltre] = useState<FiltreFacture>(filtreInitial);
  const visibles = factures.filter((f) => dansFiltreFacture(f, filtre));

  const cadre = useHautMesure<HTMLElement>();

  return (
    <section ref={cadre} className="panel glass-panel fin-liste">
      <div className="fin-filtres" role="group" aria-label="Filtrer les factures">
        {FILTRES.map((f) => (
          <button key={f.cle} type="button" className={filtre === f.cle ? 'is-active' : ''} aria-pressed={filtre === f.cle} onClick={() => setFiltre(f.cle)}>
            {f.libelle} ({factures.filter((x) => dansFiltreFacture(x, f.cle)).length})
          </button>
        ))}
        <BoutonExport desactive={!visibles.length} onExporter={() => exporterFactures(visibles)} />
      </div>
      <div className="admin-table-wrap fin-table-wrap">
        <table className="admin-table fin-table fin-table--factures">
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Client</th>
              <th>Créée le</th>
              <th>Échéance</th>
              <th>Payée</th>
              <th className="num">Total TTC</th>
              <th>Encaissé</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="me-vide">
                  Aucune facture dans ce filtre.
                </td>
              </tr>
            )}
            {parMois(visibles).map((g) => (
              <MoisFactures key={g.mois} mois={g.mois} factures={g.elements} onOuvrir={onOuvrir} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="fin-pied">Cliquer une ligne ouvre le document. Aucun document ne se supprime : une facture se corrige par un avoir.</p>
    </section>
  );
}

function MoisFactures({ mois, factures, onOuvrir }: { mois: string; factures: FactureCentrale[]; onOuvrir: (f: FactureCentrale) => void }) {
  return (
    <>
      <tr className="fin-mois">
        <td colSpan={5}>{libelleMois(mois)}</td>
        <td className="num">{formatMontant(factures.reduce((s, f) => s + f.montantTtc, 0))}</td>
        <td colSpan={2} />
      </tr>
      {factures.map((f) => {
        const s = statutFacture(f);
        const payee = payeeLe(f);
        const pct = f.montantTtc > 0 ? Math.min(100, Math.round((f.montantPaye / f.montantTtc) * 100)) : 0;
        const code = f.dossierCrm?.code ?? f.projet?.code ?? null;
        return (
          <tr key={f.id} className="fin-ligne" onClick={() => onOuvrir(f)}>
            <td data-label="Numéro" className="fl-ref">
              <span className="cell-stack">
                <span className={`fin-code${f.reference ? '' : ' factu-ref-prevue'}`} title={f.reference ? undefined : 'Référence attribuée à la validation'}>
                  {f.reference ?? 'brouillon'}
                </span>
                {f.dossierCrm ? (
                  <span className="cell-sub">directe</span>
                ) : (
                  f.tranche && (
                    <span className="cell-sub">
                      {f.tranche.rang}/{f.tranche.total}
                    </span>
                  )
                )}
              </span>
            </td>
            <td data-label="Client" className="fl-client">
              <span className="cell-stack">
                <strong>{f.client?.nom ?? '—'}</strong>
                {code && <span className="cell-sub fin-code fin-code--leger">{code}</span>}
              </span>
            </td>
            <td data-label="Créée le" className="fl-date">{jjmmaaaa(f.creeLe)}</td>
            <td data-label="Échéance" className={`fl-echeance${f.statutEffectif === 'en_retard' && f.echeanceLe && f.echeanceLe < aujourdhui() ? ' fin-retard' : ''}`}>
              {f.echeanceLe ? jjmmaaaa(f.echeanceLe) : '—'}
            </td>
            <td data-label="Payée" className="fl-payee">{payee ? jjmmaaaa(payee) : ''}</td>
            <td data-label="Total TTC" className="num fl-ttc">
              <strong>{formatMontant(f.montantTtc)}</strong>
            </td>
            <td data-label="Encaissé" className="fl-encaisse">
              {!f.estAvoir && (
                <span className="fin-encaisse">
                  <strong>{formatMontant(f.montantPaye)}</strong>
                  <span className="fin-barre" aria-hidden>
                    <span style={{ width: `${pct}%` }} />
                  </span>
                </span>
              )}
            </td>
            <td data-label="Statut" className="fl-statut">
              <span className={`pill pill--${s.ton}`}>{s.libelle}</span>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function exporterFactures(factures: FactureCentrale[]) {
  exporterCsv('factures', [
    { titre: 'Numéro', valeur: (f) => f.reference ?? 'brouillon' },
    { titre: 'Libellé', valeur: (f) => f.libelle },
    { titre: 'Client', valeur: (f) => f.client?.nom },
    { titre: 'Projet / dossier', valeur: (f) => f.dossierCrm?.code ?? f.projet?.code },
    { titre: 'Créée le', valeur: (f) => dateExport(f.creeLe) },
    { titre: 'Émise le', valeur: (f) => dateExport(f.emiseLe) },
    { titre: 'Échéance', valeur: (f) => dateExport(f.echeanceLe) },
    { titre: 'Payée le', valeur: (f) => dateExport(payeeLe(f)) },
    { titre: 'Montant HT (FCFA)', valeur: (f) => f.montantHt },
    { titre: 'TVA (FCFA)', valeur: (f) => f.montantTva },
    { titre: 'Montant TTC (FCFA)', valeur: (f) => f.montantTtc },
    { titre: 'Encaissé (FCFA)', valeur: (f) => f.montantPaye },
    { titre: 'Reste à encaisser (FCFA)', valeur: (f) => (f.estAvoir ? 0 : Math.max(0, f.montantTtc - f.montantPaye)) },
    { titre: 'Statut', valeur: (f) => statutFacture(f).libelle },
  ], factures);
}
