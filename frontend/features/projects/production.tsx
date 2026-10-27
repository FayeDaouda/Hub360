'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlarmClock, CalendarClock, Gauge, TriangleAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';
import { KpiStrip } from '@/components/ui/kpi';
import { niveauSuffisant } from '@/lib/auth';
import { useSessionCourante } from '@/lib/layout-contexte';
import { getRentabilite, type LigneRentabilite } from '@/lib/rentabilite';
import { getProduction } from './api';
import { loadTone } from './production-labels';
import { ProductionRowItem } from './production-row';
import { CellsLoad, UpcomingDeadlines } from './production-sections';
import type { ProductionView } from './types';

// Tableau de production (revue Dir. GC, 21/10/2026, lot 6) : toute la
// production sur un écran — projets par risque, charge des cellules sur deux
// semaines, échéances des 14 jours. Dir. GC : les projets dont il porte le
// dossier ; CTO et CEO : tous, avec la couleur de rentabilité.
export function Production({ slug }: { slug: string }) {
  const router = useRouter();
  const session = useSessionCourante();
  const [view, setView] = useState<ProductionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profitability, setProfitability] = useState<Map<string, LigneRentabilite>>(new Map());
  const [cell, setCell] = useState('');
  const [lateOnly, setLateOnly] = useState(false);
  const [deliverySoon, setDeliverySoon] = useState(false);
  // La matrice fait foi (revue CIO) : marges en lecture = couleur de marge.
  const showMargin = niveauSuffisant(session, 'finances_marges', 'lecture') && session.role !== 'societe_admin';

  useEffect(() => {
    getProduction(slug)
      .then(setView)
      .catch((e) => setError(e instanceof Error ? e.message : 'Lecture impossible.'));
    if (showMargin) {
      getRentabilite(slug)
        .then((r) => setProfitability(new Map(r.lignes.map((l) => [l.projet.id, l]))))
        .catch(() => setProfitability(new Map()));
    }
  }, [slug, showMargin]);

  // Filtres : cellule, retards, livraisons proches (règle du serveur).
  const rows = useMemo(
    () =>
      (view?.lignes ?? []).filter(
        (l) =>
          (!cell || l.projet.cellule === cell) &&
          (!lateOnly || l.enRetard > 0 || l.livraisonDepassee) &&
          (!deliverySoon || l.livraisonProche),
      ),
    [view, cell, lateOnly, deliverySoon],
  );

  if (error) return <FieldError>{error}</FieldError>;
  if (!view) return <Skeleton />;
  const c = view.chiffres;
  const cells = [...new Set(view.lignes.map((l) => l.projet.cellule).filter((x): x is string => !!x))].sort();
  const open = (projectId: string) => router.push(`/admin/${slug}/projets?projet=${projectId}`);

  return (
    <div className="prod">
      <p className="eq-sous-titre">
        {view.perimetre === 'mes_projets' ? 'Les projets dont vous portez le dossier' : 'Tous les projets ouverts'}, du
        plus à risque au plus tranquille : avancement, calendrier, décisions en attente, prochaine tranche, charge des
        cellules.
      </p>
      <KpiStrip
        tiles={[
          {
            id: 'retard',
            label: 'En retard',
            value: c.enRetard,
            hint: lateOnly ? 'filtre actif' : 'tâches en retard ou livraison dépassée',
            icon: TriangleAlert,
            state: c.enRetard ? 'risque' : 'succes',
            action: { type: 'filter', active: lateOnly, onClick: () => setLateOnly((x) => !x) },
          },
          {
            id: 'livraisons',
            label: 'Livraisons sous 15 jours',
            value: c.livraisons15,
            hint: deliverySoon ? 'filtre actif' : undefined,
            icon: CalendarClock,
            state: c.livraisons15 ? 'attention' : 'succes',
            action: { type: 'filter', active: deliverySoon, onClick: () => setDeliverySoon((x) => !x) },
          },
          {
            id: 'attente',
            label: 'En attente de décision',
            value: c.enAttente,
            hint: 'remises, visas, prolongations, TS',
            icon: AlarmClock,
            state: c.enAttente ? 'attention' : 'succes',
            action: { type: 'link', href: `/admin/${slug}` },
          },
          {
            id: 'charge',
            label: 'Charge moyenne · 2 semaines',
            value: c.chargeMoyenne === null ? '—' : `${c.chargeMoyenne} %`,
            hint: view.charge.zone ? `zone normale ${view.charge.zone.de} à ${view.charge.zone.a} %` : undefined,
            icon: Gauge,
            state: loadTone(c.chargeMoyenne, view.charge.zone) === 'succes' ? 'succes' : 'attention',
          },
        ]}
      />

      <section className="panel glass-panel prod-section" aria-label="Projets">
        <div className="prod-tete">
          <h2 className="dmd-titre">
            Projets · {rows.length}
            {rows.length !== c.ouverts ? ` sur ${c.ouverts}` : ''}
          </h2>
          {cells.length > 1 && (
            <select
              className="field-input prod-filtre"
              aria-label="Cellule"
              value={cell}
              onChange={(e) => setCell(e.target.value)}
            >
              <option value="">Toutes les cellules</option>
              {cells.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="dmd-note">Aucun projet pour ces filtres.</p>
        ) : (
          <ul className="prod-liste">
            {rows.map((l) => (
              <ProductionRowItem
                key={l.projet.id}
                row={l}
                profitability={profitability.get(l.projet.id)}
                showMargin={showMargin}
                onOpen={open}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="prod-bas">
        <CellsLoad load={view.charge} />
        <UpcomingDeadlines view={view} onOpen={open} />
      </div>
    </div>
  );
}
