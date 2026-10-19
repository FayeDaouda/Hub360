'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleCheck, Clock, ListChecks, RotateCcw } from 'lucide-react';
import { sectionAccessible } from '@/lib/acces-back-office';
import { ApiError } from '@/lib/client-api';
import { useSessionCourante } from '@/lib/layout-contexte';
import { getMesTaches, libelleStatut, STATUT_TACHE } from '@/lib/mon-espace';
import { formatHeures, getMonTemps, LIBELLE_MANQUE, libelleMois } from '@/lib/temps';
import type { MonTemps, StatsPerformances, TacheMonEspace } from '@/lib/types';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { RemiseModal } from './remise-modal';

type Filtre = 'toutes' | 'en_cours' | 'en_retard' | 'validees';

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
// Le projet dans la vue Projets : back-office (?projet=) ou espace collaborateur.
const lienProjet = (base: string, projetId: string) =>
  base.startsWith('/admin') ? `${base}/projets?projet=${projetId}` : `${base}/projets/${projetId}`;

const FILTRES: { cle: Filtre; libelle: string; garde: (t: TacheMonEspace) => boolean }[] = [
  { cle: 'toutes', libelle: 'Toutes', garde: () => true },
  { cle: 'en_cours', libelle: 'En cours', garde: (t) => t.statut !== 'validee' },
  { cle: 'en_retard', libelle: 'En retard', garde: (t) => t.statut === 'en_retard' },
  { cle: 'validees', libelle: 'Validées', garde: (t) => t.statut === 'validee' },
];


// Remise jugée « à temps » : dernière remise au plus tard le jour de l'échéance.
const jugee = (t: TacheMonEspace) => !!t.remisLe && !!t.echeance;
const aTemps = (t: TacheMonEspace) => jugee(t) && t.remisLe!.slice(0, 10) <= t.echeance!;
const pct = (n: number, sur: number) => (sur ? Math.round((n / sur) * 100) : null);

// « Mon espace » · Mes performances — un BILAN (revue Salarié 19/10/2026) :
// respect des délais, taux de reprise, mois par mois, historique des tâches
// validées. On agit dans « Mes tâches » ; les rôles sans cette page gardent
// ici la liste des tâches assignées et leur remise au N+1.
export function MesPerformances({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = pathname.split('/mon-espace')[0];
  const aujourdhui = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [donnees, setDonnees] = useState<{ taches: TacheMonEspace[]; stats: StatsPerformances } | null>(null);
  const [temps, setTemps] = useState<MonTemps | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [aRemettre, setARemettre] = useState<TacheMonEspace | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [heuresParMois, setHeuresParMois] = useState<Record<string, MonTemps['feuille']>>({});
  const aMesTaches = sectionAccessible(useSessionCourante(), 'mes-taches');

  const charger = useCallback(() => {
    getMesTaches(slug)
      .then(setDonnees)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger vos tâches.'));
    getMonTemps(slug)
      .then(setTemps)
      .catch(() => setTemps(null));
  }, [slug]);
  useEffect(charger, [charger]);
  // Heures de chaque mois suivi (feuilles de temps) pour le bilan mensuel.
  const periodes = temps?.periodes.join(',');
  useEffect(() => {
    if (!periodes) return;
    Promise.all(periodes.split(',').map((m) => getMonTemps(slug, m).then((r) => [m, r.feuille] as const)))
      .then((l) => setHeuresParMois(Object.fromEntries(l)))
      .catch(() => setHeuresParMois({}));
  }, [slug, periodes]);

  if (!donnees) {
    return erreur ? (
      <p className="empty-state">{erreur}</p>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }
  const { taches, stats } = donnees;
  const visibles = taches.filter(FILTRES.find((f) => f.cle === filtre)!.garde);
  const rd = stats.respectDelais;
  const validees = taches.filter((t) => t.statut === 'validee');
  const remises = validees.filter((t) => t.version >= 1);
  const avecReprise = remises.filter((t) => t.version > 1).length;
  const tauxReprise = pct(avecReprise, remises.length);
  const mois = [...(temps?.periodes ?? [])].reverse();
  const historique = [...validees].sort((a, b) => (b.valideLe ?? '').localeCompare(a.valideLe ?? ''));

  return (
    <>
      <KpiStrip
        tuiles={[
          {
            cle: 'delais',
            label: 'Respect des délais',
            valeur: rd.pct == null ? '—' : `${rd.pct} %`,
            // Seules les tâches validées APRÈS une remise datée sont jugées.
            sousTexte: rd.total
              ? `${rd.aTemps} remise${rd.aTemps > 1 ? 's' : ''} à temps sur ${rd.total} jugée${rd.total > 1 ? 's' : ''}`
              : stats.validees
                ? `${stats.validees} tâche${stats.validees > 1 ? 's' : ''} validée${stats.validees > 1 ? 's' : ''}, aucune remise datée à juger`
                : 'aucune tâche validée pour l’instant',
            icone: CircleCheck,
          },
          {
            cle: 'reprises',
            label: 'Taux de reprise',
            valeur: tauxReprise == null ? '—' : `${tauxReprise} %`,
            sousTexte: remises.length
              ? `${avecReprise} tâche${avecReprise > 1 ? 's' : ''} renvoyée${avecReprise > 1 ? 's' : ''} au moins une fois sur ${remises.length}`
              : 'aucune remise validée pour l’instant',
            icone: RotateCcw,
          },
          {
            cle: 'validees',
            label: 'Tâches validées',
            valeur: stats.validees,
            sousTexte: `${stats.enCours} encore en cours`,
            icone: ListChecks,
          },
          {
            cle: 'temps',
            label: temps ? `Temps imputé · ${libelleMois(temps.feuille.mois)}` : 'Temps imputé',
            valeur: temps ? formatHeures(temps.feuille.heuresImputees) : '—',
            sousTexte: `${temps?.feuille.occupation ?? 0} % d’occupation · calcul automatique`,
            icone: Clock,
          },
        ]}
      />

      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Mois par mois</h2>
        <div className="admin-table-wrap">
          <table className="admin-table bilan-table">
            <thead>
              <tr>
                <th>Mois</th>
                <th className="num">Validées</th>
                <th>Remises à temps</th>
                <th className="num">Reprises</th>
                <th className="num">Heures imputées</th>
                <th className="num">Occupation</th>
              </tr>
            </thead>
            <tbody>
              {mois.map((m) => {
                const du = validees.filter((t) => t.valideLe?.startsWith(m));
                const jugees = du.filter(jugee);
                const p = pct(jugees.filter(aTemps).length, jugees.length);
                const f = heuresParMois[m];
                return (
                  <tr key={m}>
                    <td className="bilan-mois">{libelleMois(m)}</td>
                    <td data-label="Validées" className="num">
                      {du.length}
                    </td>
                    <td data-label="Remises à temps">
                      {p == null ? (
                        <span className="cell-sub">—</span>
                      ) : (
                        <span className="bilan-barre" title={`${p} %`}>
                          <span style={{ width: `${p}%` }} />
                          <em>{p} %</em>
                        </span>
                      )}
                    </td>
                    <td data-label="Reprises" className="num">
                      {du.filter((t) => t.version > 1).length}
                    </td>
                    <td data-label="Heures imputées" className="num">
                      {f ? formatHeures(f.heuresImputees) : '…'}
                    </td>
                    <td data-label="Occupation" className="num">
                      {f?.occupation == null ? '—' : `${f.occupation} %`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Tâches validées · {historique.length}</h2>
        {historique.length === 0 ? (
          <p className="dmd-note">Aucune tâche validée pour l’instant.</p>
        ) : (
          <ul className="dmd-liste">
            {historique.map((t) => (
              <li key={t.id} className="dmd-ligne">
                <span>
                  <strong>{t.libelle}</strong>
                  <span className="cell-sub">
                    <Link className="lien-inline" href={lienProjet(base, t.projetId)}>
                      {t.projetCode}
                    </Link>{' '}
                    · {t.etape}
                    {t.valideLe && ` · validée le ${jjmmaaaa(t.valideLe)}`}
                  </span>
                </span>
                <span className="dmd-actions">
                  {t.version > 1 && (
                    <span className="pill pill--attention">
                      {t.version - 1} reprise{t.version > 2 ? 's' : ''}
                    </span>
                  )}
                  {!jugee(t) ? (
                    <span className="pill pill--neutre">sans remise datée</span>
                  ) : aTemps(t) ? (
                    <span className="pill pill--succes">à temps</span>
                  ) : (
                    <span className="pill pill--risque">remise après l’échéance</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {aMesTaches ? (
        <p className="dmd-note me-pied">
          Vos tâches en cours, à remettre ou à reprendre :{' '}
          <Link className="lien-inline" href={`${base}/mes-taches`}>
            Mes tâches
          </Link>
          .
        </p>
      ) : (
      <section className="panel glass-panel dmd-section temps-panel">
        <div className="temps-entete">
          <div>
            <h2 className="dmd-titre">Mes tâches assignées</h2>
            <p className="dmd-note">
              Seul ce qui vous est assigné compte. Le temps est calculé automatiquement (durée standard de chaque tâche,
              répartie sur sa fenêtre), hors absences ; il n’est pas modifiable.
            </p>
          </div>
          <div className="vue-toggle" role="group" aria-label="Filtrer les tâches">
            {FILTRES.map((f) => (
              <button key={f.cle} type="button" className={filtre === f.cle ? 'is-active' : ''} aria-pressed={filtre === f.cle} onClick={() => setFiltre(f.cle)}>
                {f.libelle} · {taches.filter(f.garde).length}
              </button>
            ))}
          </div>
        </div>
        {erreur && <p className="field-erreur">{erreur}</p>}
        <div className="admin-table-wrap">
          <table className="admin-table temps-table">
            <thead>
              <tr>
                <th>Projet</th>
                <th>Tâche</th>
                <th className="num">Durée std</th>
                <th>Période</th>
                <th>Échéance</th>
                <th className="num">Temps prévu · imputé</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="me-vide">
                    Rien dans cette liste.
                  </td>
                </tr>
              )}
              {visibles.map((t) => (
                <tr key={t.id}>
                  <td className="rh-matricule">
                    <Link className="lien-inline" href={lienProjet(base, t.projetId)}>
                      {t.projetCode}
                    </Link>
                  </td>
                  <td data-label="Tâche">
                    {t.libelle}
                    <span className="cell-sub">
                      {t.projetClient} · {t.etape}
                    </span>
                    {/* Motif sous la tâche : dans la colonne Statut, il poussait « Remettre » hors de l'écran. */}
                    {t.renvoiMotif && <span className="cell-sub temps-alerte">« {t.renvoiMotif} »</span>}
                  </td>
                  <td data-label="Durée std" className="num">
                    {t.dureeStandard == null ? '—' : formatHeures(t.dureeStandard)}
                  </td>
                  <td data-label="Période">
                    {t.debut && t.echeance ? `du ${jjmm(t.debut)} au ${jjmm(t.echeance)}` : '—'}
                    {t.manque && t.statut !== 'validee' && <span className="cell-sub temps-alerte">{LIBELLE_MANQUE[t.manque]}</span>}
                  </td>
                  <td data-label="Échéance">{t.echeance ? jjmmaaaa(t.echeance) : '—'}</td>
                  <td data-label="Prévu · imputé" className="num">
                    {t.dureeStandard == null ? '—' : `${formatHeures(t.dureeStandard)} · ${formatHeures(t.heuresImputees)}`}
                  </td>
                  <td data-label="Statut">
                    <span className="perf-statut">
                      <span className={`pill ${STATUT_TACHE[t.statut].pill}`}>{libelleStatut(t, aujourdhui)}</span>
                      {t.statut !== 'validee' && t.statut !== 'remise' && (
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => setARemettre(t)}
                        >
                          Remettre
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      )}

      {aRemettre && <RemiseModal slug={slug} tache={aRemettre} onRemise={setDonnees} onClose={() => setARemettre(null)} />}
    </>
  );
}
