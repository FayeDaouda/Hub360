'use client';

import { useState } from 'react';
import { filtreDevis, libelleMois, parMois, statutDevis, type FiltreDevis } from '@/lib/finances';
import { formatAmount } from '@/lib/format';
import { dateExport, exporterCsv } from '@/lib/export-csv';
import { BoutonExport } from '@/components/bouton-export';
import type { Devis } from '@/lib/types';
import { formatDate } from '@/lib/dates';
import { Pill } from '@/components/ui/pill';

const FILTRES: { cle: FiltreDevis; libelle: string }[] = [
  { cle: 'tout', libelle: 'Tout' },
  { cle: 'en_cours', libelle: 'En cours' },
  { cle: 'acceptes', libelle: 'Acceptés' },
  { cle: 'brouillons', libelle: 'Brouillons' },
  { cle: 'refuses', libelle: 'Refusés' },
];

// Finances · Devis (maquette) : filtres, devis groupés par mois de création
// avec le total TTC du mois ; une ligne ouvre le document.
export function OngletDevis({
  devis,
  projets,
  onOuvrir,
}: {
  devis: Devis[];
  projets: Map<string, string>;
  onOuvrir: (d: Devis) => void;
}) {
  const [filtre, setFiltre] = useState<FiltreDevis>('tout');
  const visibles = devis.filter((d) => filtre === 'tout' || filtreDevis(d) === filtre);
  const compte = (f: FiltreDevis) => (f === 'tout' ? devis.length : devis.filter((d) => filtreDevis(d) === f).length);

  return (
    <section className="panel glass-panel fin-liste liste-collee">
      <div
        className="fin-filtres liste-collee-outils liste-collee-outils--partout"
        role="group"
        aria-label="Filtrer les devis"
      >
        {FILTRES.map((f) => (
          <button
            key={f.cle}
            type="button"
            className={filtre === f.cle ? 'is-active' : ''}
            aria-pressed={filtre === f.cle}
            onClick={() => setFiltre(f.cle)}
          >
            {f.libelle} ({compte(f.cle)})
          </button>
        ))}
        <BoutonExport desactive={!visibles.length} onExporter={() => exporterDevis(visibles, projets)} />
      </div>
      <div className="admin-table-wrap fin-table-wrap">
        <table className="admin-table fin-table fin-table--devis">
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
      <p className="fin-pied">
        Chaque ligne ouvre son document. Aucun document ne se supprime : un devis refusé reste tracé.
      </p>
    </section>
  );
}

function MoisDevis({
  mois,
  devis,
  projets,
  onOuvrir,
}: {
  mois: string;
  devis: Devis[];
  projets: Map<string, string>;
  onOuvrir: (d: Devis) => void;
}) {
  return (
    <>
      <tr className="fin-mois">
        <td colSpan={5}>{libelleMois(mois)}</td>
        <td className="num">{formatAmount(devis.reduce((s, d) => s + d.montantTtc, 0))}</td>
        <td />
      </tr>
      {devis.map((d) => {
        const s = statutDevis(d);
        const projet = d.dossierCrm?.code ?? (d.projetId ? projets.get(d.projetId) : null);
        return (
          <tr key={d.id} className="fin-ligne" onClick={() => onOuvrir(d)}>
            <td data-label="Numéro" className="fin-code fl-ref">
              {d.reference ?? 'brouillon'}
            </td>
            <td data-label="Client" className="fl-client">
              <strong>{d.client.nom}</strong>
            </td>
            <td data-label="Projet" className="fin-code fin-code--leger fl-projet">
              {projet ?? '—'}
            </td>
            <td data-label="Créé le" className="fl-date">
              {formatDate(d.creeLe)}
            </td>
            <td data-label="Total HT" className="num fl-ht">
              {formatAmount(d.montantHt)}
            </td>
            <td data-label="Total TTC" className="num fl-ttc">
              <strong>{formatAmount(d.montantTtc)}</strong>
            </td>
            <td data-label="Statut" className="fl-statut">
              <Pill tone={s.ton}>{s.libelle}</Pill>
              {d.alerteAvenant && (
                <Pill tone="risque" className="fin-alerte">
                  Avenant non accepté · {d.alerteAvenant.jours} j
                </Pill>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function exporterDevis(devis: Devis[], projets: Map<string, string>) {
  exporterCsv(
    'devis',
    [
      { titre: 'Numéro', valeur: (d) => d.reference ?? 'brouillon' },
      { titre: 'Objet', valeur: (d) => d.objet },
      { titre: 'Client', valeur: (d) => d.client.nom },
      { titre: 'Projet / dossier', valeur: (d) => d.dossierCrm?.code ?? (d.projetId ? projets.get(d.projetId) : null) },
      { titre: 'Créé le', valeur: (d) => dateExport(d.creeLe) },
      { titre: 'Envoyé le', valeur: (d) => dateExport(d.dateEnvoi) },
      { titre: 'Montant HT (FCFA)', valeur: (d) => d.montantHt },
      { titre: 'TVA (FCFA)', valeur: (d) => d.montantTva },
      { titre: 'Montant TTC (FCFA)', valeur: (d) => d.montantTtc },
      { titre: 'Statut', valeur: (d) => statutDevis(d).libelle },
    ],
    devis,
  );
}
