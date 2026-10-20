'use client';

import { useCallback, useEffect, useState } from 'react';
import { BoutonExport } from '@/components/bouton-export';
import { dateExport, exporterCsv } from '@/lib/export-csv';
import { getJournalAudit, type CategorieAudit, type JournalAudit as Journal, type LigneAudit } from '@/lib/pilotage';

const CATEGORIES: Record<CategorieAudit, string> = {
  comptes: 'Comptes',
  droits: 'Droits',
  finances: 'Finances',
  reglages: 'Réglages',
  rh: 'Départs',
  // Qui a consulté ou modifié le salaire ou un bulletin de qui (jamais de montant).
  paie: 'Paie',
};
const horodatage = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Pilotage › Journal (CEO, CIO) : qui a fait quoi et quand — comptes, droits,
// factures et paiements, réglages, départs. Lecture seule.
export function JournalAudit({ slug }: { slug: string }) {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [periode, setPeriode] = useState<{ debut?: string; fin?: string }>({});
  const [categorie, setCategorie] = useState<CategorieAudit | 'toutes'>('toutes');
  const [personne, setPersonne] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setErreur(null);
    getJournalAudit(slug, periode.debut, periode.fin)
      .then(setJournal)
      .catch((e) => setErreur(e instanceof Error && e.message ? e.message : 'Journal indisponible.'));
  }, [slug, periode]);
  useEffect(charger, [charger]);

  if (!journal) return erreur ? <p className="field-erreur">{erreur}</p> : <div className="skeleton admin-skeleton-panel" aria-hidden />;

  const auteurs = [...new Set(journal.lignes.map((l) => l.par).filter((x): x is string => !!x))].sort();
  const visibles = journal.lignes.filter((l) => (categorie === 'toutes' || l.categorie === categorie) && (!personne || l.par === personne));
  const compte = (c: CategorieAudit) => journal.lignes.filter((l) => l.categorie === c).length;

  return (
    <section className="panel glass-panel pi-journal">
      <h2>Journal d’audit</h2>
      <p className="pi-aide">Traces enregistrées par le HUB, jamais modifiables. Une consultation couvre un an au plus.</p>
      <div className="pi-journal-outils">
        <label className="field">
          <span className="field-label">Du</span>
          <input className="field-input" type="date" value={periode.debut ?? journal.debut} onChange={(e) => setPeriode((p) => ({ ...p, debut: e.target.value }))} />
        </label>
        <label className="field">
          <span className="field-label">Au</span>
          <input className="field-input" type="date" value={periode.fin ?? journal.fin} onChange={(e) => setPeriode((p) => ({ ...p, fin: e.target.value }))} />
        </label>
        <label className="field">
          <span className="field-label">Par</span>
          <select className="field-input" value={personne} onChange={(e) => setPersonne(e.target.value)}>
            <option value="">Tout le monde</option>
            {auteurs.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="fin-filtres" role="group" aria-label="Filtrer le journal">
        <button type="button" className={categorie === 'toutes' ? 'is-active' : ''} aria-pressed={categorie === 'toutes'} onClick={() => setCategorie('toutes')}>
          Tout ({journal.lignes.length})
        </button>
        {(Object.keys(CATEGORIES) as CategorieAudit[]).map((c) => (
          <button key={c} type="button" className={categorie === c ? 'is-active' : ''} aria-pressed={categorie === c} onClick={() => setCategorie(c)}>
            {CATEGORIES[c]} ({compte(c)})
          </button>
        ))}
        <BoutonExport desactive={!visibles.length} onExporter={() => exporter(visibles, journal)} />
      </div>
      {erreur && <p className="field-erreur">{erreur}</p>}
      {visibles.length === 0 ? (
        <p className="empty-state">Aucune trace sur cette période et ce filtre.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table pi-journal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Détail</th>
                <th>Par</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((l) => (
                <tr key={l.id}>
                  <td data-label="Date">{horodatage(l.le)}</td>
                  <td data-label="Action">
                    <span className="cell-stack">
                      <strong>{l.action}</strong>
                      <span className="cell-sub">{CATEGORIES[l.categorie]}</span>
                    </span>
                  </td>
                  <td data-label="Détail" className="pi-journal-detail">
                    {l.detail}
                  </td>
                  <td data-label="Par">{l.par ?? <span className="cell-sub">le HUB</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function exporter(lignes: LigneAudit[], j: Journal) {
  exporterCsv(`journal-audit-${j.debut}-${j.fin}`, [
    { titre: 'Date', valeur: (l) => dateExport(l.le) },
    { titre: 'Heure', valeur: (l) => new Date(l.le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) },
    { titre: 'Catégorie', valeur: (l) => CATEGORIES[l.categorie] },
    { titre: 'Action', valeur: (l) => l.action },
    { titre: 'Détail', valeur: (l) => l.detail },
    { titre: 'Par', valeur: (l) => l.par ?? 'le HUB' },
  ], lignes);
}
