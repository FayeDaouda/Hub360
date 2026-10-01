'use client';

import { useState } from 'react';
import { filtreDevis, jjmmaaaa, libelleMois, parMois, statutDevis, type FiltreDevis } from '@/lib/finances';
import { formatMontant } from '@/lib/format';
import type { Devis } from '@/lib/types';

const FILTRES: { cle: FiltreDevis; libelle: string }[] = [
  { cle: 'tout', libelle: 'Tout' },
  { cle: 'en_cours', libelle: 'En cours' },
  { cle: 'acceptes', libelle: 'Acceptés' },
  { cle: 'brouillons', libelle: 'Brouillons' },
  { cle: 'refuses', libelle: 'Refusés' },
];

// Finances · Devis (maquette) : filtres, devis groupés par mois de création
// avec le total TTC du mois ; une ligne ouvre le document.
export function OngletDevis({ devis, projets, onOuvrir }: { devis: Devis[]; projets: Map<string, string>; onOuvrir: (d: Devis) => void }) {
  const [filtre, setFiltre] = useState<FiltreDevis>('tout');
  const visibles = devis.filter((d) => filtre === 'tout' || filtreDevis(d) === filtre);
  const compte = (f: FiltreDevis) => (f === 'tout' ? devis.length : devis.filter((d) => filtreDevis(d) === f).length);

  return (
    <section className="panel glass-panel fin-liste">
      <div className="vue-toggle crm-situations fin-filtres" role="group" aria-label="Filtrer les devis">
        {FILTRES.map((f) => (
          <button key={f.cle} type="button" className={filtre === f.cle ? 'is-active' : ''} aria-pressed={filtre === f.cle} onClick={() => setFiltre(f.cle)}>
            {f.libelle} <span className="crm-compte">{compte(f.cle)}</span>
          </button>
        ))}
      </div>
      <div className="admin-table-wrap fin-table-wrap">
        <table className="admin-table fin-table">
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Client</th>
              <th>Projet</th>
              <th>Créé le</th>
              <th className="num">Total HT</th>
              <th className="num">Total TTC</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="me-vide">
                  Aucun devis dans ce filtre.
                </td>
              </tr>
            )}
            {parMois(visibles).map((g) => (
              <MoisDevis key={g.mois} mois={g.mois} devis={g.elements} projets={projets} onOuvrir={onOuvrir} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="fin-pied">Cliquer une ligne ouvre le document. Aucun document ne se supprime : un devis refusé reste tracé.</p>
    </section>
  );
}

function MoisDevis({ mois, devis, projets, onOuvrir }: { mois: string; devis: Devis[]; projets: Map<string, string>; onOuvrir: (d: Devis) => void }) {
  return (
    <>
      <tr className="fin-mois">
        <td colSpan={5}>{libelleMois(mois)}</td>
        <td className="num">{formatMontant(devis.reduce((s, d) => s + d.montantTtc, 0))}</td>
        <td />
      </tr>
      {devis.map((d) => {
        const s = statutDevis(d);
        const projet = d.dossierCrm?.code ?? (d.projetId ? projets.get(d.projetId) : null);
        return (
          <tr key={d.id} className="fin-ligne" onClick={() => onOuvrir(d)}>
            <td data-label="Numéro" className="fin-code">
              {d.reference ?? 'brouillon'}
            </td>
            <td data-label="Client">
              <strong>{d.client.nom}</strong>
            </td>
            <td data-label="Projet" className="fin-code fin-code--leger">
              {projet ?? '—'}
            </td>
            <td data-label="Créé le">{jjmmaaaa(d.creeLe)}</td>
            <td data-label="Total HT" className="num">
              {formatMontant(d.montantHt)}
            </td>
            <td data-label="Total TTC" className="num">
              <strong>{formatMontant(d.montantTtc)}</strong>
            </td>
            <td data-label="Statut">
              <span className={`pill pill--${s.ton}`}>{s.libelle}</span>
              {d.alerteAvenant && <span className="pill pill--risque fin-alerte">Avenant non accepté · {d.alerteAvenant.jours} j</span>}
            </td>
          </tr>
        );
      })}
    </>
  );
}
