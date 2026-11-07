'use client';

import { useCallback, useEffect, useState } from 'react';
import { BoutonExport } from '@/components/bouton-export';
import { dateExport, exporterCsv } from '@/lib/export-csv';
import { getJournalAudit, type CategorieAudit, type JournalAudit as Journal, type LigneAudit } from '@/lib/pilotage';
import { formatDateTime, formatTime } from '@hub/domain';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, FieldError } from '@/components/ui/field';

const CATEGORIES: Record<CategorieAudit, string> = {
  comptes: 'Comptes',
  droits: 'Droits',
  finances: 'Finances',
  reglages: 'Réglages',
  rh: 'Départs',
  // Qui a consulté ou modifié le salaire ou un bulletin de qui (jamais de montant).
  paie: 'Paie',
  pilotage: 'Reportings',
  // Interventions de l'Administrateur HUB (déblocages, avec motif).
  administration: 'Administration',
};

// Pilotage › Journal (CEO, CIO) : qui a fait quoi et quand — comptes, droits,
// factures et paiements, réglages, départs. Lecture seule. `entete` à false :
// la page porte déjà le titre et l'explication (Administration du HUB).
export function JournalAudit({ slug, entete = true }: { slug: string; entete?: boolean }) {
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

  if (!journal) return erreur ? <ErrorState onRetry={charger}>{erreur}</ErrorState> : <Skeleton />;

  const auteurs = [...new Set(journal.lignes.map((l) => l.par).filter((x): x is string => !!x))].sort();
  const visibles = journal.lignes.filter(
    (l) => (categorie === 'toutes' || l.categorie === categorie) && (!personne || l.par === personne),
  );
  const compte = (c: CategorieAudit) => journal.lignes.filter((l) => l.categorie === c).length;

  return (
    <section className="panel glass-panel pi-journal" aria-label={entete ? undefined : 'Journal d’audit'}>
      {entete && (
        <>
          <h2>Journal d’audit</h2>
          <p className="pi-aide">
            Traces enregistrées par le HUB, jamais modifiables. Une consultation couvre un an au plus.
          </p>
        </>
      )}
      <div className="pi-journal-outils">
        <Field label="Du">
          <input
            className="field-input"
            type="date"
            value={periode.debut ?? journal.debut}
            onChange={(e) => setPeriode((p) => ({ ...p, debut: e.target.value }))}
          />
        </Field>
        <Field label="Au">
          <input
            className="field-input"
            type="date"
            value={periode.fin ?? journal.fin}
            onChange={(e) => setPeriode((p) => ({ ...p, fin: e.target.value }))}
          />
        </Field>
        <Field label="Par">
          <select className="field-input" value={personne} onChange={(e) => setPersonne(e.target.value)}>
            <option value="">Tout le monde</option>
            {auteurs.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="fin-filtres" role="group" aria-label="Filtrer le journal">
        <button
          type="button"
          className={categorie === 'toutes' ? 'is-active' : ''}
          aria-pressed={categorie === 'toutes'}
          onClick={() => setCategorie('toutes')}
        >
          Tout ({journal.lignes.length})
        </button>
        {(Object.keys(CATEGORIES) as CategorieAudit[]).map((c) => (
          <button
            key={c}
            type="button"
            className={categorie === c ? 'is-active' : ''}
            aria-pressed={categorie === c}
            onClick={() => setCategorie(c)}
          >
            {CATEGORIES[c]} ({compte(c)})
          </button>
        ))}
        <BoutonExport desactive={!visibles.length} onExporter={() => exporter(visibles, journal)} />
      </div>
      {erreur && <FieldError>{erreur}</FieldError>}
      {visibles.length === 0 ? (
        <EmptyState>Aucune trace sur cette période et ce filtre.</EmptyState>
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
                  <td data-label="Date">{formatDateTime(l.le)}</td>
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
  exporterCsv(
    `journal-audit-${j.debut}-${j.fin}`,
    [
      { titre: 'Date', valeur: (l) => dateExport(l.le) },
      {
        titre: 'Heure',
        valeur: (l) => formatTime(l.le),
      },
      { titre: 'Catégorie', valeur: (l) => CATEGORIES[l.categorie] },
      { titre: 'Action', valeur: (l) => l.action },
      { titre: 'Détail', valeur: (l) => l.detail },
      { titre: 'Par', valeur: (l) => l.par ?? 'le HUB' },
    ],
    lignes,
  );
}
