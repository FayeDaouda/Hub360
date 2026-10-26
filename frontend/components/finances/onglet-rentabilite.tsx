'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, Info, OctagonAlert, Percent, Settings2, Users } from 'lucide-react';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { BoutonExport } from '@/components/bouton-export';
import { FicheRentabilitePanneau } from '@/components/finances/fiche-rentabilite';
import { ParametresRentabilite } from '@/components/finances/parametres-rentabilite';
import { ApiError } from '@/lib/client-api';
import { exporterCsv } from '@/lib/export-csv';
import { formatAmount, formatNumber } from '@/lib/format';
import {
  finDeMois,
  formatParametre,
  formatTaux,
  getRentabilite,
  LIBELLE_ETAT,
  LIBELLE_STATUT,
  PILL_STATUT,
  type EtatDonnees,
  type LigneRentabilite,
  type Portefeuille,
} from '@/lib/rentabilite';
import { formatDate, formatMonthYear, todayIso } from '@/lib/dates';
import { plural } from '@/lib/text';

type Tri = 'marge' | 'taux' | 'cout' | 'heures';
const MOIS_DEBUT = '2026-09'; // premières feuilles de temps (rh/regles-temps.ts)

// Mois proposés : des premières feuilles au mois en cours.
function moisDisponibles(aujourdhui: string) {
  const liste: string[] = [];
  for (let m = MOIS_DEBUT; m <= aujourdhui.slice(0, 7);) {
    liste.push(m);
    const [a, mm] = m.split('-').map(Number);
    m = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`;
  }
  return liste.reverse();
}

// Onglet « Rentabilité » (lot 7, phase 1) : marge directe PROVISOIRE par
// projet. CFO et CEO voient les montants ; le CTO le taux et la couleur.
export function OngletRentabilite({ slug }: { slug: string }) {
  const aujourdhui = useMemo(() => todayIso(), []);
  const [periode, setPeriode] = useState<string>('');
  const [donnees, setDonnees] = useState<Portefeuille | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatDonnees | ''>('');
  const [tri, setTri] = useState<Tri>('marge');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [parametres, setParametres] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setErreur(null);
    getRentabilite(slug, periode || undefined)
      .then(setDonnees)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Rentabilité indisponible.'));
  }, [slug, periode, version]);

  const montants = donnees?.acces === 'montants';
  const lignes = useMemo(() => {
    if (!donnees) return [];
    const cle = (l: LigneRentabilite) => {
      // Sans montant (CTO), le tri se fait sur le taux.
      const t = montants ? tri : tri === 'heures' ? 'heures' : 'taux';
      return t === 'marge'
        ? (l.marge ?? 0)
        : t === 'taux'
          ? (l.taux ?? Infinity)
          : t === 'cout'
            ? -(l.cout ?? 0)
            : -l.heures;
    };
    // Projets suivis d'abord, triés ; « heures non suivies » à la fin, hors classement.
    const suivis = donnees.lignes.filter((l) => l.etat !== 'heures_non_suivies').sort((a, b) => cle(a) - cle(b));
    const autres = donnees.lignes.filter((l) => l.etat === 'heures_non_suivies');
    return [...suivis, ...autres].filter((l) => !etat || l.etat === etat);
  }, [donnees, tri, etat, montants]);

  if (erreur) return <p className="field-erreur">{erreur}</p>;
  if (!donnees) return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;

  const p = Object.fromEntries(donnees.parametres.map((x) => [x.cle, x]));
  const charges = p.coefficient_charges?.valeur;
  const parDefaut = donnees.parametres.some((x) => x.parDefaut);

  return (
    <div className="rt">
      <div className="rt-bandeau" role="note">
        <Info size={16} aria-hidden />
        <span>
          <strong>Marge directe provisoire</strong> : montant HT facturé moins le coût salarial des heures imputées et
          contrôlées.{' '}
          {charges == null ? 'Charges patronales non comprises' : `Charges patronales au coefficient de ${charges} %`},
          dépenses et frais généraux non compris.
          {parDefaut && ' Paramètres par défaut, non validés par un expert-comptable.'} Calculé le{' '}
          {new Date(donnees.calculeLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.
          {!donnees.periode &&
            (donnees.arreteAu ? (
              <>
                {' '}
                <strong>Cumul arrêté au {finDeMois(donnees.arreteAu)}</strong>, dernier mois entièrement contrôlé :
                facturé et coût s’arrêtent à cette date, les factures émises depuis entreront au prochain arrêté.
              </>
            ) : (
              <strong> Aucun mois n’est encore entièrement contrôlé : le cumul reste vide.</strong>
            ))}
        </span>
        <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setParametres(true)}>
          <Settings2 size={14} aria-hidden /> Paramètres
        </button>
      </div>

      <div className="fin-kpi rt-kpi">
        <KpiStrip
          tuiles={
            montants
              ? [
                  {
                    cle: 'ht',
                    label: 'Montant HT facturé',
                    montant: donnees.totaux.ht ?? 0,
                    sousTexte: `${donnees.projetsComplets} projet(s) aux données complètes, avoirs déduits`,
                    icone: Banknote,
                    etat: 'marque',
                  },
                  {
                    cle: 'cout',
                    label: 'Coût salarial direct',
                    montant: donnees.totaux.cout ?? 0,
                    sousTexte: `heures contrôlées · base ${formatParametre(p.heures_annuelles)}`,
                    icone: Users,
                    etat: 'marque',
                  },
                  {
                    cle: 'marge',
                    label: 'Marge directe provisoire',
                    ...(donnees.totaux.marge === null
                      ? { valeur: 'Données insuffisantes' }
                      : { montant: donnees.totaux.marge }),
                    sousTexte:
                      donnees.totaux.marge === null
                        ? 'aucun projet aux données complètes'
                        : `${formatTaux(donnees.totaux.taux)} · cible ${formatParametre(p.marge_cible)}`,
                    icone: Percent,
                    etat: (donnees.totaux.marge ?? 0) < 0 ? 'risque' : 'marque',
                  },
                ]
              : [
                  {
                    cle: 'taux',
                    label: 'Taux de marge directe provisoire',
                    valeur: donnees.projetsComplets ? formatTaux(donnees.totaux.taux) : 'Données insuffisantes',
                    sousTexte: `${donnees.projetsComplets} projet(s) aux données complètes · cible ${formatParametre(p.marge_cible)}`,
                    icone: Percent,
                    etat: 'marque',
                  },
                ]
          }
        />
      </div>

      {(donnees.blocages.feuilles.length > 0 || donnees.blocages.salaires.salaries > 0) && (
        <section className="panel glass-panel rt-blocages" aria-label="Ce qui bloque le calcul">
          <h2 className="dmd-titre">
            <OctagonAlert size={17} aria-hidden /> Ce qui bloque le calcul
          </h2>
          <ul className="rt-blocages-liste">
            {donnees.blocages.feuilles.map((b) => (
              <li key={b.mois}>
                <strong>
                  {plural(b.feuilles, 'feuille')} de temps de {formatMonthYear(b.mois)} à contrôler
                </strong>{' '}
                · bloque{b.feuilles > 1 ? 'nt' : ''} {plural(b.projets, 'projet')}
                <span className="cell-sub">
                  À faire par la RH{donnees.blocages.rh.length ? ` (${donnees.blocages.rh.join(', ')})` : ''}, dans RH ›
                  Feuilles de temps.
                </span>
              </li>
            ))}
            {donnees.blocages.salaires.salaries > 0 && (
              <li>
                <strong>{plural(donnees.blocages.salaires.salaries, 'salarié')} sans salaire validé</strong> · bloque
                {donnees.blocages.salaires.salaries > 1 ? 'nt' : ''} {donnees.blocages.salaires.projets} projet
                {donnees.blocages.salaires.projets > 1 ? 's' : ''}
                <span className="cell-sub">
                  La RH propose le salaire{donnees.blocages.rh.length ? ` (${donnees.blocages.rh.join(', ')})` : ''}, le
                  CFO le valide
                  {donnees.blocages.cfo.length ? ` (${donnees.blocages.cfo.join(', ')})` : ''}.
                </span>
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="panel glass-panel rt-liste">
        <div className="rt-outils">
          <label className="field">
            <span className="field-label">Période</span>
            <select className="field-input" value={periode} onChange={(e) => setPeriode(e.target.value)}>
              <option value="">Cumul depuis l’ouverture</option>
              {moisDisponibles(aujourdhui).map((m) => (
                <option key={m} value={m}>
                  {formatMonthYear(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Données</span>
            <select className="field-input" value={etat} onChange={(e) => setEtat(e.target.value as EtatDonnees | '')}>
              <option value="">Tous les projets</option>
              {(Object.keys(LIBELLE_ETAT) as EtatDonnees[]).map((k) => (
                <option key={k} value={k}>
                  {LIBELLE_ETAT[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Trier par</span>
            <select
              className="field-input"
              value={montants ? tri : tri === 'heures' ? 'heures' : 'taux'}
              onChange={(e) => setTri(e.target.value as Tri)}
            >
              {montants && <option value="marge">Marge (la plus faible d’abord)</option>}
              <option value="taux">Taux (le plus faible d’abord)</option>
              {montants && <option value="cout">Coût salarial (le plus élevé d’abord)</option>}
              <option value="heures">Heures (le plus d’abord)</option>
            </select>
          </label>
          {montants && <BoutonExport desactive={!lignes.length} onExporter={() => exporter(lignes, donnees.periode)} />}
        </div>
        {periode && (
          <p className="dmd-note">
            Un mois isolé peut être très négatif ou très positif selon les dates de facture : le cumul est la vue de
            référence.
          </p>
        )}

        {lignes.length === 0 ? (
          <p className="dmd-note">Aucun projet pour ce filtre.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className={`admin-table rt-table${montants ? '' : ' rt-table--taux'}`}>
              <thead>
                <tr>
                  <th>Projet</th>
                  {montants && <th className="num">HT facturé</th>}
                  {montants && <th className="num">Coût salarial</th>}
                  {montants && <th className="num">Marge provisoire</th>}
                  <th>Taux · statut</th>
                  <th title="Prolongations accordées et reprises demandées : les heures standard ne voient pas les dépassements">
                    Dépassements
                  </th>
                  <th className="num">Heures</th>
                  <th>Données</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.projet.id} className="fin-ligne" onClick={() => setOuvert(l.projet.id)}>
                    <td data-label="Projet" className="rt-projet" title={l.projet.programme || undefined}>
                      <span className="cell-stack">
                        <strong>{l.projet.code}</strong>
                        <span className="cell-sub">{l.projet.client}</span>
                      </span>
                    </td>
                    {montants && (
                      <td data-label="HT facturé" className="num rt-ht">
                        {formatAmount(l.ht ?? 0)}
                      </td>
                    )}
                    {montants && (
                      <td data-label="Coût salarial" className="num rt-cout">
                        {formatAmount(l.cout ?? 0)}
                      </td>
                    )}
                    {montants && (
                      <td
                        data-label="Marge provisoire"
                        className={`num rt-marge${(l.marge ?? 0) < 0 ? ' rt-negatif' : ''}`}
                      >
                        <strong>{l.marge === null ? '—' : formatAmount(l.marge)}</strong>
                      </td>
                    )}
                    <td data-label="Taux · statut" className="rt-taux">
                      <span className="rt-taux-ligne">
                        {l.etat === 'complet' ? formatTaux(l.taux) : '—'}
                        {l.statut && (
                          <span className={`pill ${PILL_STATUT[l.statut]}`}>{LIBELLE_STATUT[l.statut]}</span>
                        )}
                      </span>
                    </td>
                    <td data-label="Dépassements" className="rt-signaux">
                      <span className="cell-stack">
                        <span className={l.prolongations ? 'rt-signal' : 'cell-sub'}>
                          {plural(l.prolongations, 'prolongation')}
                        </span>
                        <span className={l.reprises ? 'rt-signal' : 'cell-sub'}>{plural(l.reprises, 'reprise')}</span>
                      </span>
                    </td>
                    <td data-label="Heures" className="num rt-heures">
                      {formatNumber(l.heures)} h
                      {l.heuresAttente > 0 && (
                        <span className="cell-sub">dont {formatNumber(l.heuresAttente)} h à contrôler</span>
                      )}
                    </td>
                    <td data-label="Données" className="rt-etat">
                      <span className="cell-stack">
                        <span
                          className={`pill ${l.etat === 'complet' ? 'pill--neutre' : 'pill--attention'}`}
                          title={l.raisons.join(' · ') || undefined}
                        >
                          {LIBELLE_ETAT[l.etat]}
                        </span>
                        <span className="cell-sub">
                          {l.misAJour ? `à jour du ${formatDate(l.misAJour)}` : 'aucune donnée'}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ouvert && <FicheRentabilitePanneau slug={slug} projetId={ouvert} onClose={() => setOuvert(null)} />}
      {parametres && (
        <ParametresRentabilite
          slug={slug}
          onClose={(modifie) => {
            setParametres(false);
            if (modifie) setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

function exporter(lignes: LigneRentabilite[], periode: string | null) {
  exporterCsv(
    `rentabilite-${periode ?? 'cumul'}`,
    [
      { titre: 'Projet', valeur: (l) => l.projet.code },
      { titre: 'Client', valeur: (l) => l.projet.client },
      { titre: 'Montant HT facturé (FCFA)', valeur: (l) => l.ht },
      { titre: 'Coût salarial direct (FCFA)', valeur: (l) => l.cout },
      { titre: 'Marge directe provisoire (FCFA)', valeur: (l) => l.marge },
      { titre: 'Taux (%)', valeur: (l) => l.taux },
      { titre: 'Statut', valeur: (l) => (l.statut ? LIBELLE_STATUT[l.statut] : null) },
      { titre: 'Prolongations', valeur: (l) => l.prolongations },
      { titre: 'Reprises', valeur: (l) => l.reprises },
      { titre: 'Heures contrôlées', valeur: (l) => l.heures },
      { titre: 'Heures à contrôler', valeur: (l) => l.heuresAttente },
      {
        titre: 'Données',
        valeur: (l) => `${LIBELLE_ETAT[l.etat]}${l.raisons.length ? ` (${l.raisons.join(' ; ')})` : ''}`,
      },
    ],
    lignes,
  );
}
