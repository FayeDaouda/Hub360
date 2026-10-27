'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlarmClock, CalendarClock, Gauge, TriangleAlert } from 'lucide-react';
import { KpiStrip } from '@/components/ui/kpi';
import { niveauSuffisant } from '@/lib/auth';
import { useSessionCourante } from '@/lib/layout-contexte';
import { getProduction } from '@/features/projects/api';
import { stepNumber } from '@/features/projects/labels';
import type { ProductionRow, ProductionView } from '@/features/projects/types';
import { getRentabilite, type LigneRentabilite } from '@/lib/rentabilite';
import { addDays, formatDayMonth, plural, todayIso } from '@hub/domain';
import { Pill } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';

const STATUT: Record<ProductionRow['statutChantier'], string> = {
  conception: 'En conception',
  chantier: 'En chantier',
  livre: 'Livré',
};

// Ce qui attend une décision sur le projet (remises, visas, prolongations, TS).
function enAttente(a: ProductionRow['attente']): string[] {
  return [
    a.remises && plural(a.remises, 'remise'),
    a.visas && `${plural(a.visas, 'visa')} DPLG`,
    a.prolongations && plural(a.prolongations, 'prolongation'),
    a.ts && plural(a.ts, 'TS'),
  ].filter((x): x is string => !!x);
}

// Ton d'une charge : au-dessus de la zone normale = surcharge, en dessous =
// sous-charge, dedans = normal (zone des Réglages, 70 à 100 % par défaut).
function tonCharge(
  pct: number | null,
  zone: { de: number; a: number } | null,
): 'risque' | 'succes' | 'info' | 'neutre' {
  if (pct === null) return 'neutre';
  const z = zone ?? { de: 70, a: 100 };
  return pct > z.a ? 'risque' : pct >= z.de ? 'succes' : 'info';
}

// Tableau de production (revue Dir. GC, 21/10/2026, lot 6) : toute la
// production sur un écran — projets par risque, charge des cellules sur deux
// semaines, échéances des 14 jours. Dir. GC : les projets dont il porte le
// dossier ; CTO et CEO : tous, avec la couleur de rentabilité.
export function Production({ slug }: { slug: string }) {
  const router = useRouter();
  const session = useSessionCourante();
  const [vue, setVue] = useState<ProductionView | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [renta, setRenta] = useState<Map<string, LigneRentabilite>>(new Map());
  const [cellule, setCellule] = useState('');
  const [retard, setRetard] = useState(false);
  const [livraison, setLivraison] = useState(false);
  // La matrice fait foi (revue CIO) : marges en lecture = couleur de marge.
  const voitRenta = niveauSuffisant(session, 'finances_marges', 'lecture') && session.role !== 'societe_admin';

  useEffect(() => {
    getProduction(slug)
      .then(setVue)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Lecture impossible.'));
    if (voitRenta) {
      getRentabilite(slug)
        .then((r) => setRenta(new Map(r.lignes.map((l) => [l.projet.id, l]))))
        .catch(() => setRenta(new Map()));
    }
  }, [slug, voitRenta]);

  const aujourdhui = todayIso();
  const dans15 = addDays(todayIso(), 15);
  const lignes = useMemo(
    () =>
      (vue?.lignes ?? []).filter(
        (l) =>
          (!cellule || l.projet.cellule === cellule) &&
          (!retard || l.enRetard > 0 || l.livraisonDepassee) &&
          (!livraison || (l.statutChantier !== 'livre' && l.livraisonLe >= aujourdhui && l.livraisonLe <= dans15)),
      ),
    [vue, cellule, retard, livraison, aujourdhui, dans15],
  );

  if (erreur) return <FieldError>{erreur}</FieldError>;
  if (!vue) return <Skeleton />;
  const c = vue.chiffres;
  const cellules = [...new Set(vue.lignes.map((l) => l.projet.cellule).filter((x): x is string => !!x))].sort();
  const echeances = [
    ...vue.livraisons.map((l) => ({
      cle: `liv-${l.projetId}`,
      le: l.livraisonLe,
      texte: `Livraison · ${l.code} · ${l.client}`,
      projetId: l.projetId,
    })),
    ...vue.lignes.flatMap((l) =>
      l.echeances.map((e) => ({
        cle: `${l.projet.id}-${e.carte}`,
        le: e.finLe,
        texte: `${e.carte} · ${l.projet.code}`,
        projetId: l.projet.id,
      })),
    ),
  ].sort((a, b) => a.le.localeCompare(b.le));
  const ouvrir = (projetId: string) => router.push(`/admin/${slug}/projets?projet=${projetId}`);

  return (
    <div className="prod">
      <p className="eq-sous-titre">
        {vue.perimetre === 'mes_projets' ? 'Les projets dont vous portez le dossier' : 'Tous les projets ouverts'}, du
        plus à risque au plus tranquille : avancement, calendrier, décisions en attente, prochaine tranche, charge des
        cellules.
      </p>
      <KpiStrip
        tiles={[
          {
            id: 'retard',
            label: 'En retard',
            value: c.enRetard,
            hint: retard ? 'filtre actif' : 'tâches en retard ou livraison dépassée',
            icon: TriangleAlert,
            state: c.enRetard ? 'risque' : 'succes',
            action: { type: 'filter', active: retard, onClick: () => setRetard((x) => !x) },
          },
          {
            id: 'livraisons',
            label: 'Livraisons sous 15 jours',
            value: c.livraisons15,
            hint: livraison ? 'filtre actif' : undefined,
            icon: CalendarClock,
            state: c.livraisons15 ? 'attention' : 'succes',
            action: { type: 'filter', active: livraison, onClick: () => setLivraison((x) => !x) },
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
            hint: vue.charge.zone ? `zone normale ${vue.charge.zone.de} à ${vue.charge.zone.a} %` : undefined,
            icon: Gauge,
            state: tonCharge(c.chargeMoyenne, vue.charge.zone) === 'succes' ? 'succes' : 'attention',
          },
        ]}
      />

      <section className="panel glass-panel prod-section" aria-label="Projets">
        <div className="prod-tete">
          <h2 className="dmd-titre">
            Projets · {lignes.length}
            {lignes.length !== c.ouverts ? ` sur ${c.ouverts}` : ''}
          </h2>
          {cellules.length > 1 && (
            <select
              className="field-input prod-filtre"
              aria-label="Cellule"
              value={cellule}
              onChange={(e) => setCellule(e.target.value)}
            >
              <option value="">Toutes les cellules</option>
              {cellules.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          )}
        </div>
        {lignes.length === 0 ? (
          <p className="dmd-note">Aucun projet pour ces filtres.</p>
        ) : (
          <ul className="prod-liste">
            {lignes.map((l) => {
              const attente = enAttente(l.attente);
              const r = renta.get(l.projet.id);
              const pct = l.total ? Math.round((l.faites / l.total) * 100) : 0;
              return (
                <li key={l.projet.id}>
                  <button
                    type="button"
                    className="prod-ligne"
                    data-risque={l.livraisonDepassee || l.enRetard > 0 ? 'oui' : undefined}
                    onClick={() => ouvrir(l.projet.id)}
                  >
                    <span className="prod-projet">
                      <strong className="fin-code">{l.projet.code}</strong>
                      <span className="cell-sub">
                        {l.projet.client}
                        {l.projet.cellule ? ` · ${l.projet.cellule}` : ''}
                      </span>
                      <Pill tone="neutre">{STATUT[l.statutChantier]}</Pill>
                    </span>
                    <span className="prod-avancement">
                      <span className="prod-etiquette">Avancement</span>
                      <span>
                        {l.etape
                          ? `${stepNumber(l.etape.numero)} · ${l.etape.libelle}${l.etape.terminee ? ' · terminée' : ''}`
                          : 'Pas encore commencé'}
                      </span>
                      {l.souffrance.length > 0 && (
                        // Une ligne : « 1 tâche en souffrance dans 01 · Onboard », ou le total et les étapes.
                        <span
                          className="prod-souffrance"
                          title={l.souffrance
                            .map((s) => `${stepNumber(s.numero)} · ${s.libelle} : ${s.taches}`)
                            .join('\n')}
                        >
                          {l.souffrance.length === 1
                            ? `${plural(l.souffrance[0].taches, 'tâche')} en souffrance dans ${stepNumber(l.souffrance[0].numero)} · ${l.souffrance[0].libelle}`
                            : `${plural(
                                l.souffrance.reduce((t, s) => t + s.taches, 0),
                                'tâche',
                              )} en souffrance : ${l.souffrance.map((s) => `${stepNumber(s.numero)} (${s.taches})`).join(', ')}`}
                        </span>
                      )}
                      <span className="prod-barre" aria-label={`${l.faites} tâches faites sur ${l.total}`}>
                        <span style={{ width: `${pct}%` }} />
                      </span>
                      <span className="cell-sub">
                        {l.faites}/{l.total} tâches
                      </span>
                    </span>
                    <span className="prod-calendrier">
                      <span className="prod-etiquette">Calendrier</span>
                      <span>
                        J{l.jour} / {l.horizon}
                      </span>
                      <span className={l.livraisonDepassee ? 'prod-alerte' : 'cell-sub'}>
                        livraison {l.livraisonDepassee ? 'dépassée, ' : ''}le {formatDayMonth(l.livraisonLe)}
                      </span>
                    </span>
                    <span className="prod-retards">
                      <span className="prod-etiquette">Retards</span>
                      {l.enRetard ? (
                        <Pill tone="risque">{plural(l.enRetard, 'tâche')}</Pill>
                      ) : (
                        <span className="cell-sub">aucun</span>
                      )}
                      {l.prolongees > 0 && <span className="cell-sub">{l.prolongees} qualifié(s)</span>}
                    </span>
                    <span className="prod-attente">
                      <span className="prod-etiquette">En attente</span>
                      {attente.length ? (
                        attente.map((a) => (
                          <Pill key={a} tone="attention">
                            {a}
                          </Pill>
                        ))
                      ) : (
                        <span className="cell-sub">rien</span>
                      )}
                    </span>
                    <span className="prod-tranche">
                      <span className="prod-etiquette">Facturation</span>
                      {!l.tranche ? (
                        <span className="cell-sub">tranches émises</span>
                      ) : l.tranche.attend.length === 0 ? (
                        <Pill tone="succes">{l.tranche.code} prête</Pill>
                      ) : (
                        <span className="cell-sub">
                          {l.tranche.code} attend {l.tranche.attend.join(', ')}
                        </span>
                      )}
                    </span>
                    {voitRenta && (
                      <span className="prod-renta">
                        <span className="prod-etiquette">Marge</span>
                        {r && r.etat === 'complet' && r.taux !== null ? (
                          <Pill
                            className={`pill--${r.statut === 'vert' ? 'succes' : r.statut === 'rouge' ? 'risque' : r.statut === 'ambre' ? 'attention' : 'neutre'}`}
                          >
                            {String(r.taux).replace('.', ',')} %
                          </Pill>
                        ) : (
                          <span className="cell-sub">données insuffisantes</span>
                        )}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="prod-bas">
        <section className="panel glass-panel prod-section" aria-label="Charge des cellules">
          <h2 className="dmd-titre">
            Charge des cellules · du {formatDayMonth(vue.charge.periode.debut)} au{' '}
            {formatDayMonth(vue.charge.periode.fin)}
          </h2>
          <p className="dmd-note">
            Heures prévues des tâches à faire, sur la présence de chacun (absences et fériés retirés), comparées à la
            zone normale
            {vue.charge.zone ? ` de ${vue.charge.zone.de} à ${vue.charge.zone.a} %` : ''}.
          </p>
          <div className="prod-cellules">
            {vue.charge.cellules.map((ce) => (
              <div key={ce.code} className="prod-cellule">
                <div className="prod-cellule-tete">
                  <strong>{ce.nom}</strong>
                  <Pill className={`pill--${tonCharge(ce.moyenne, vue.charge.zone)}`}>
                    {ce.moyenne === null ? '—' : `${ce.moyenne} %`}
                  </Pill>
                </div>
                {ce.membres.map((m) => (
                  <div key={m.id} className="prod-membre" data-ton={tonCharge(m.pourcentage, vue.charge.zone)}>
                    <span className="prod-membre-nom">{m.nom}</span>
                    <span className="prod-barre prod-barre--charge" aria-hidden>
                      <span style={{ width: `${Math.min(100, m.pourcentage ?? 0)}%` }} />
                    </span>
                    <span className="prod-membre-pct">
                      {m.pourcentage === null ? 'absent' : `${m.pourcentage} %`}
                      {m.joursAbsence > 0 && m.pourcentage !== null ? ` · ${m.joursAbsence} j abs.` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="panel glass-panel prod-section" aria-label="À venir">
          <h2 className="dmd-titre">À venir · 14 jours</h2>
          {echeances.length === 0 ? (
            <p className="dmd-note">Aucune livraison ni fin de carte clé dans les 14 jours.</p>
          ) : (
            <ul className="prod-echeances">
              {echeances.map((e) => (
                <li key={e.cle}>
                  <button type="button" className="prod-echeance" onClick={() => ouvrir(e.projetId)}>
                    <span className="prod-echeance-date">{formatDayMonth(e.le)}</span>
                    <span>{e.texte}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
