'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlarmClock, CircleCheck, Clock, ListTodo } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { getMesTaches, remettreTache, STATUT_TACHE } from '@/lib/mon-espace';
import { formatHeures, getMonTemps, LIBELLE_MANQUE, libelleMois } from '@/lib/temps';
import type { MonTemps, StatsPerformances, TacheMonEspace } from '@/lib/types';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { ConfirmModal } from '@/components/admin/confirm-modal';
import { ChampsRemise, corpsRemise, SAISIE_REMISE_VIDE, type SaisieRemise } from '@/components/projets-ouverts/champs-remise';

type Filtre = 'toutes' | 'en_cours' | 'en_retard' | 'validees';

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const ecartJours = (de: string, a: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
// Le projet dans la vue Projets : back-office (?projet=) ou espace collaborateur.
const lienProjet = (base: string, projetId: string) =>
  base.startsWith('/admin') ? `${base}/projets?projet=${projetId}` : `${base}/projets/${projetId}`;

const FILTRES: { cle: Filtre; libelle: string; garde: (t: TacheMonEspace) => boolean }[] = [
  { cle: 'toutes', libelle: 'Toutes', garde: () => true },
  { cle: 'en_cours', libelle: 'En cours', garde: (t) => t.statut !== 'validee' },
  { cle: 'en_retard', libelle: 'En retard', garde: (t) => t.statut === 'en_retard' },
  { cle: 'validees', libelle: 'Validées', garde: (t) => t.statut === 'validee' },
];

// Libellé du statut, précisé par la fenêtre quand la tâche est ouverte.
function libelleStatut(t: TacheMonEspace, aujourdhui: string): string {
  if (t.statut === 'en_cours') {
    const reste = ecartJours(aujourdhui, t.echeance!);
    return reste === 0 ? 'Échéance aujourd’hui' : `Échéance dans ${reste} j`;
  }
  if (t.statut === 'a_venir') return `À venir · J-${ecartJours(aujourdhui, t.debut!)}`;
  if (t.statut === 'en_retard') return `En retard · ${ecartJours(t.echeance!, aujourdhui)} j`;
  return STATUT_TACHE[t.statut].libelle;
}

// « Mon espace » · Mes performances (RH lot 5c) : respect des délais, tâches
// en cours et en retard, temps du mois, et la liste des tâches assignées avec
// leur remise au N+1.
export function MesPerformances({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = pathname.split('/mon-espace')[0];
  const aujourdhui = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [donnees, setDonnees] = useState<{ taches: TacheMonEspace[]; stats: StatsPerformances } | null>(null);
  const [temps, setTemps] = useState<MonTemps | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [aRemettre, setARemettre] = useState<TacheMonEspace | null>(null);
  const [saisie, setSaisie] = useState<SaisieRemise>(SAISIE_REMISE_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    getMesTaches(slug)
      .then(setDonnees)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger vos tâches.'));
    getMonTemps(slug)
      .then(setTemps)
      .catch(() => setTemps(null));
  }, [slug]);
  useEffect(charger, [charger]);

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
  const basculer = (f: Filtre) => setFiltre((x) => (x === f ? 'toutes' : f));
  const rd = stats.respectDelais;

  return (
    <>
      <KpiStrip
        tuiles={[
          {
            cle: 'delais',
            label: 'Respect des délais',
            valeur: rd.pct == null ? '—' : `${rd.pct} %`,
            sousTexte: `${stats.validees} tâches validées, dont ${rd.aTemps} remises à temps`,
            icone: CircleCheck,
          },
          {
            cle: 'en-cours',
            label: 'Tâches en cours',
            valeur: stats.enCours,
            sousTexte: 'cliquer pour les voir',
            icone: ListTodo,
            action: { type: 'filtre', actif: filtre === 'en_cours', onClick: () => basculer('en_cours') },
          },
          {
            cle: 'retard',
            label: 'En retard',
            valeur: stats.enRetard,
            sousTexte: stats.enRetard ? 'à remettre au plus vite' : 'aucun retard',
            icone: AlarmClock,
            alerte: stats.enRetard > 0,
            action: { type: 'filtre', actif: filtre === 'en_retard', onClick: () => basculer('en_retard') },
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
                      {t.renvoiMotif && <span className="cell-sub temps-alerte">« {t.renvoiMotif} »</span>}
                      {t.statut !== 'validee' && t.statut !== 'remise' && (
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => {
                            setSaisie(SAISIE_REMISE_VIDE);
                            setARemettre(t);
                          }}
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

      {aRemettre && (
        <ConfirmModal
          titre="Remettre la tâche"
          message={
            <>
              « {aRemettre.libelle} » ({aRemettre.projetCode}) part en validation chez votre chef de team (ou l’Architecte DPLG). Vous ne
              pourrez plus la remettre tant qu’elle n’est pas validée ou renvoyée en reprise.
              <ChampsRemise id="perf-remise" valeur={saisie} onChange={setSaisie} />
            </>
          }
          confirmer="Remettre"
          onConfirm={async () => {
            setDonnees(await remettreTache(slug, aRemettre, corpsRemise(saisie)));
          }}
          onClose={() => setARemettre(null)}
        />
      )}
    </>
  );
}
