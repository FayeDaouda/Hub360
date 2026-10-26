'use client';

import { Fragment, useMemo, useState } from 'react';
import { BellRing, ChevronDown } from 'lucide-react';
import { BoutonExport } from '@/components/bouton-export';
import { ApiError } from '@/lib/client-api';
import { dateExport, exporterCsv } from '@/lib/export-csv';
import { relancerFacture } from '@/lib/facturation';
import { formatMontant, formatMontantCompact } from '@/lib/format';
import { balanceAgee, echeancier, TRANCHES, type LigneBalance } from '@/lib/tresorerie';
import type { FactureCentrale } from '@/lib/types';

const jjmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const nomFacture = (f: FactureCentrale) =>
  f.reference ?? (f.statut === 'brouillon' ? `${f.libelle || 'tranche'} (prévue)` : 'facture');

// Onglet « Trésorerie » de Finances (revue CFO 20/10/2026, lot 3) :
// encaissements attendus à 30 / 60 / 90 jours, puis balance âgée des
// créances par client, avec relance et export.
export function OngletTresorerie({
  slug,
  factures,
  peutRelancer,
  onOuvrirFacture,
}: {
  slug: string;
  factures: FactureCentrale[];
  peutRelancer: boolean;
  onOuvrirFacture: (id: string) => void;
}) {
  const aujourdhui = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const balance = useMemo(() => balanceAgee(factures, aujourdhui), [factures, aujourdhui]);
  const prevision = useMemo(() => echeancier(factures, aujourdhui), [factures, aujourdhui]);
  const [fenetre, setFenetre] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [relances, setRelances] = useState<Record<string, string>>({});

  const cumul = prevision.fenetres.reduce((t, w) => ({ sur: t.sur + w.sur, prevu: t.prevu + w.prevu }), {
    sur: 0,
    prevu: 0,
  });
  const listeFenetre =
    fenetre === 'retard'
      ? prevision.enRetard.factures
      : fenetre === 'nondate'
        ? prevision.nonDate.factures
        : (prevision.fenetres.find((w) => w.cle === fenetre)?.factures ?? []);

  async function relancer(f: FactureCentrale) {
    setRelances((r) => ({ ...r, [f.id]: 'Envoi…' }));
    try {
      const { envoye } = await relancerFacture(slug, f.id);
      setRelances((r) => ({ ...r, [f.id]: envoye ? 'Relance envoyée' : 'E-mail non envoyé : contactez le client' }));
    } catch (e) {
      setRelances((r) => ({ ...r, [f.id]: e instanceof ApiError ? e.message : 'Relance impossible' }));
    }
  }

  const carte = (cle: string, titre: string, sur: number, prevu: number, sous: string, ton?: 'risque' | 'neutre') => (
    <button
      type="button"
      key={cle}
      className={`tre-carte${fenetre === cle ? ' is-active' : ''}`}
      data-ton={ton}
      aria-pressed={fenetre === cle}
      onClick={() => setFenetre((x) => (x === cle ? null : cle))}
    >
      <span className="tre-carte-titre">{titre}</span>
      <strong>{formatMontantCompact(sur)}</strong>
      <span className="cell-sub">{prevu > 0 ? `+ ${formatMontantCompact(prevu)} prévus` : sous}</span>
    </button>
  );

  return (
    <div className="tre">
      <section className="panel glass-panel tre-section" aria-label="Encaissements attendus">
        <div className="tre-tete">
          <h2 className="dmd-titre">Encaissements attendus</h2>
          <p className="dmd-note">
            D’ici 90 jours : <strong>{formatMontant(cumul.sur)}</strong> facturés à encaisser
            {cumul.prevu > 0 && (
              <>
                {' '}
                + <strong>{formatMontant(cumul.prevu)}</strong> de tranches prévues, pas encore émises
              </>
            )}
            .
          </p>
        </div>
        <div className="tre-cartes">
          {carte(
            'retard',
            'Déjà en retard',
            prevision.enRetard.montant,
            0,
            `${prevision.enRetard.factures.length} facture(s) à recouvrer`,
            'risque',
          )}
          {prevision.fenetres.map((w) => carte(w.cle, w.libelle, w.sur, w.prevu, `jusqu’au ${jjmm(w.au)}`))}
          {carte(
            'nondate',
            'Sans date',
            prevision.nonDate.sur,
            prevision.nonDate.prevu,
            'jalon de projet à dater',
            'neutre',
          )}
        </div>
        {fenetre && (
          <ul className="tre-liste">
            {listeFenetre.length === 0 && <li className="dmd-note">Rien dans cette période.</li>}
            {listeFenetre.map((f) => (
              <li key={f.id}>
                <button type="button" className="tre-ligne" onClick={() => onOuvrirFacture(f.id)}>
                  <span className="tre-ligne-date">{jjmm(f.echeanceLe)}</span>
                  <span className="tre-ligne-corps">
                    <strong>{f.client?.nom ?? '—'}</strong>
                    <span className="cell-sub">
                      {nomFacture(f)}
                      {f.projet ? ` · ${f.projet.code}` : ''}
                    </span>
                  </span>
                  <span className="tre-ligne-montant">
                    {formatMontant(f.statut === 'brouillon' ? f.montantTtc : f.resteAPayer)}
                    {f.statut === 'brouillon' && <span className="pill pill--neutre">prévue</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {(prevision.auDela.sur > 0 || prevision.auDela.prevu > 0) && (
          <p className="cell-sub">
            Au-delà de 90 jours : {formatMontant(prevision.auDela.sur + prevision.auDela.prevu)}.
          </p>
        )}
      </section>

      <section className="panel glass-panel tre-section" aria-label="Balance âgée des créances">
        <div className="tre-tete tre-tete--ligne">
          <div>
            <h2 className="dmd-titre">Balance âgée des créances</h2>
            <p className="dmd-note">
              Ce que chaque client doit, par ancienneté du retard depuis l’échéance de la facture.
            </p>
          </div>
          <BoutonExport desactive={!balance.lignes.length} onExporter={() => exporterBalance(balance.lignes)} />
        </div>
        {balance.lignes.length === 0 ? (
          <p className="dmd-note">Aucune créance : tout ce qui est facturé est encaissé.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table tre-table">
              <thead>
                <tr>
                  <th>Client</th>
                  {TRANCHES.map((t) => (
                    <th key={t.cle} className="num">
                      {t.libelle}
                    </th>
                  ))}
                  <th className="num">Total dû</th>
                </tr>
              </thead>
              <tbody>
                {balance.lignes.map((l) => (
                  <Fragment key={l.client}>
                    <tr className={ouvert === l.client ? 'is-active' : undefined}>
                      <td>
                        <button
                          type="button"
                          className="rh-nom tre-client"
                          aria-expanded={ouvert === l.client}
                          onClick={() => setOuvert((x) => (x === l.client ? null : l.client))}
                        >
                          <ChevronDown
                            size={14}
                            aria-hidden
                            className={ouvert === l.client ? 'is-ouvert' : undefined}
                          />
                          {l.client}
                        </button>
                        <span className="cell-sub">
                          {l.creances.length} facture{l.creances.length > 1 ? 's' : ''}
                        </span>
                      </td>
                      {TRANCHES.map((t) => (
                        <td
                          key={t.cle}
                          data-label={t.libelle}
                          className="num"
                          data-tranche={l.montants[t.cle] > 0 ? t.cle : undefined}
                          data-vide={l.montants[t.cle] > 0 ? undefined : ''}
                        >
                          {l.montants[t.cle] > 0 ? formatMontant(l.montants[t.cle]) : '—'}
                        </td>
                      ))}
                      <td data-label="Total dû" className="num tre-total">
                        {formatMontant(l.montants.total)}
                      </td>
                    </tr>
                    {ouvert === l.client && (
                      <tr className="tre-detail">
                        <td colSpan={TRANCHES.length + 2}>
                          <ul className="tre-liste">
                            {l.creances.map(({ facture: f, retard }) => (
                              <li key={f.id} className="tre-creance">
                                <button type="button" className="tre-ligne" onClick={() => onOuvrirFacture(f.id)}>
                                  <span className="tre-ligne-date">{jjmm(f.echeanceLe)}</span>
                                  <span className="tre-ligne-corps">
                                    <strong>{nomFacture(f)}</strong>
                                    <span className="cell-sub">
                                      {retard > 0 ? `${retard} j de retard` : 'non échue'}
                                      {f.projet ? ` · ${f.projet.code}` : ''}
                                    </span>
                                  </span>
                                  <span className="tre-ligne-montant">{formatMontant(f.resteAPayer)}</span>
                                </button>
                                {peutRelancer &&
                                  retard > 0 &&
                                  (relances[f.id] ? (
                                    <span className="cell-sub">{relances[f.id]}</span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn-ghost btn-ghost--sm"
                                      onClick={() => relancer(f)}
                                    >
                                      <BellRing size={13} aria-hidden /> Relancer
                                    </button>
                                  ))}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="tre-pied">
                  <td>Total</td>
                  {TRANCHES.map((t) => (
                    <td
                      key={t.cle}
                      data-label={t.libelle}
                      className="num"
                      data-vide={balance.total[t.cle] > 0 ? undefined : ''}
                    >
                      {formatMontant(balance.total[t.cle])}
                    </td>
                  ))}
                  <td data-label="Total dû" className="num tre-total">
                    {formatMontant(balance.total.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function exporterBalance(lignes: LigneBalance[]) {
  const detail = lignes.flatMap((l) => l.creances.map((c) => ({ client: l.client, ...c })));
  exporterCsv(
    'balance-agee',
    [
      { titre: 'Client', valeur: (x) => x.client },
      { titre: 'Facture', valeur: (x) => x.facture.reference },
      { titre: 'Projet', valeur: (x) => x.facture.projet?.code },
      { titre: 'Émise le', valeur: (x) => dateExport(x.facture.emiseLe) },
      { titre: 'Échéance', valeur: (x) => dateExport(x.facture.echeanceLe) },
      { titre: 'Jours de retard', valeur: (x) => x.retard },
      { titre: 'Tranche', valeur: (x) => TRANCHES.find((t) => t.cle === x.tranche)?.libelle },
      { titre: 'Montant TTC (FCFA)', valeur: (x) => x.facture.montantTtc },
      { titre: 'Reste dû (FCFA)', valeur: (x) => x.facture.resteAPayer },
    ],
    detail,
  );
}
