'use client';

import { useEffect, useState } from 'react';
import { AlarmClock, Building2, FileCheck2, HandCoins, Wallet } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { getFinancesGroupe, type FinancesGroupe } from '@/lib/facturation';
import { formatAmount, formatDayMonth, plural } from '@hub/domain';
import { KpiStrip } from '@/components/ui/kpi';
import { Skeleton } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';

// Onglet « Groupe » de Finances (lot 4, 31/10/2026) : les finances consolidées
// de toutes les sociétés du groupe. Chaque facture reste celle de sa société
// (son nom, sa numérotation) ; lecture seule — on agit dans l'espace de la
// société. Ouvert par l'étape « Finances du groupe » de la matrice.
export function OngletGroupe({ slug }: { slug: string }) {
  const [donnees, setDonnees] = useState<FinancesGroupe | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getFinancesGroupe(slug)
      .then(setDonnees)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Finances du groupe indisponibles.'));
  }, [slug]);

  if (erreur) return <p className="field-erreur">{erreur}</p>;
  if (!donnees) return <Skeleton size="sm" />;
  const t = donnees.total;

  return (
    <div className="fin-groupe">
      <KpiStrip
        tiles={[
          { id: 'facture', label: 'Facturé (émis)', amount: t.facture, icon: FileCheck2 },
          { id: 'encaisse', label: 'Encaissé', amount: t.encaisse, icon: Wallet, state: 'succes' },
          { id: 'reste', label: 'Reste à encaisser', amount: t.resteAEncaisser, icon: HandCoins },
          {
            id: 'retard',
            label: 'En retard de paiement',
            amount: t.enRetard.montant,
            hint: plural(t.enRetard.nombre, 'facture'),
            icon: AlarmClock,
            state: t.enRetard.nombre ? 'risque' : 'succes',
          },
        ]}
      />
      {donnees.societes.map((s) => (
        <section key={s.societe.id} className="panel glass-panel fin-groupe-societe">
          <header className="fin-groupe-tete">
            <h3>
              <Building2 size={16} aria-hidden /> {s.societe.nom}
            </h3>
            <span className="fin-groupe-chiffres">
              {plural(s.offresEnCours, 'offre')} chez le client · facturé {formatAmount(s.facture)} · encaissé{' '}
              {formatAmount(s.encaisse)} · reste {formatAmount(s.resteAEncaisser)}
            </span>
          </header>
          {s.aEncaisser.length === 0 ? (
            <p className="pi-aide">Aucune facture à encaisser.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Facture</th>
                    <th>Client</th>
                    <th>Échéance</th>
                    <th className="col-montant">Reste dû TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {s.aEncaisser.map((f) => (
                    <tr key={f.id}>
                      <td data-label="Facture">
                        <span className="cell-fort">{f.reference ?? f.libelle}</span>
                      </td>
                      <td data-label="Client">{f.client ?? '—'}</td>
                      <td data-label="Échéance">
                        {f.echeanceLe ? formatDayMonth(f.echeanceLe) : '—'}{' '}
                        {f.joursRetard > 0 && <Pill tone="risque">{plural(f.joursRetard, 'jour')} de retard</Pill>}
                      </td>
                      <td data-label="Reste dû TTC" className="col-montant">
                        {formatAmount(f.resteAPayer)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
