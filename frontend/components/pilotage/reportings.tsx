'use client';

import { useState } from 'react';
import { deposerReporting } from '@/lib/pilotage';
import { PastillesSuivi, SuiviReporting } from '@/components/pilotage/suivi-reporting';
import type { ReportingPilotage, StatutReporting, VuePilotage } from '@/lib/types';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

function pillStatut(r: ReportingPilotage): { classe: string; libelle: string } {
  const statuts: Record<StatutReporting, { classe: string; libelle: string }> = {
    a_deposer: { classe: 'pill--attention', libelle: r.contenu ? 'À déposer · prérempli' : 'À déposer' },
    en_retard: { classe: 'pill--risque', libelle: 'En retard · alerte CODIR' },
    depose: { classe: 'pill--succes', libelle: `Déposé le ${jjmmaaaa(r.deposeLe ?? '')}` },
    depose_en_retard: { classe: 'pill--risque', libelle: 'Déposé en retard · alerte CODIR' },
  };
  return statuts[r.statut];
}

// Reportings mensuels (manuel §9.4) : liste à gauche, fiche à droite —
// préremplie depuis le HUB tant qu'elle n'est pas déposée, figée ensuite.
export function Reportings({
  slug,
  reportings,
  onVue,
}: {
  slug: string;
  reportings: ReportingPilotage[];
  onVue: (v: VuePilotage) => void;
}) {
  const cle = (r: ReportingPilotage) => `${r.type}:${r.mois}`;
  // D'abord celui que l'acteur doit déposer (lien « À traiter » de la RH).
  // Puis, pour le destinataire, celui qu'il n'a pas lu ; pour l'émetteur, une question ouverte.
  const premier =
    reportings.find((r) => r.peutDeposer) ??
    reportings.find(
      (r) => (r.suivi?.peutLire && !r.suivi.luParMoi) || (r.suivi?.peutRepondre && r.suivi.questionsOuvertes > 0),
    ) ??
    // Sinon le plus récent dont l'acteur est destinataire ou émetteur.
    reportings.find((r) => r.suivi?.peutLire || r.suivi?.peutRepondre) ??
    reportings.find((r) => r.statut === 'a_deposer' || r.statut === 'en_retard') ??
    reportings[0];
  const [choisi, setChoisi] = useState<string | null>(premier ? cle(premier) : null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Brouillon d'analyse par reporting : changer de ligne ne le perd pas.
  const [analyses, setAnalyses] = useState<Record<string, string>>({});
  const r = reportings.find((x) => cle(x) === choisi) ?? null;
  const analyse = r ? (analyses[cle(r)] ?? '') : '';

  async function deposer(x: ReportingPilotage) {
    setEnvoi(true);
    setErreur(null);
    try {
      onVue(await deposerReporting(slug, x.type, x.mois, analyses[cle(x)]?.trim() ?? ''));
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'Le dépôt a échoué.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="pi-colonnes">
      <section className="panel glass-panel pi-liste">
        <h2>Reportings mensuels (manuel §9.4)</h2>
        <p className="pi-aide">
          Chaque émetteur dépose à J+5 ; un reporting en retard est une alerte signalée au CODIR (§4.3).
        </p>
        {reportings.length === 0 ? (
          <p className="pi-aide">Aucun mois clos à reporter pour l’instant.</p>
        ) : (
          <div className="pi-table" role="table">
            <div className="pi-ligne pi-ligne--tete pi-ligne--reporting" role="row">
              <span role="columnheader">Reporting</span>
              <span role="columnheader">Période</span>
              <span role="columnheader">Émetteur → destinataire</span>
              <span role="columnheader">Échéance</span>
              <span role="columnheader">Statut</span>
            </div>
            {reportings.map((x) => {
              const pill = pillStatut(x);
              return (
                <button
                  key={cle(x)}
                  type="button"
                  role="row"
                  className={`pi-ligne pi-ligne--reporting pi-ligne--choix${choisi === cle(x) ? ' is-active' : ''}`}
                  onClick={() => setChoisi(cle(x))}
                >
                  <strong role="cell">{x.titre}</strong>
                  <span role="cell">{x.periode}</span>
                  <span role="cell">
                    {x.emetteur} → {x.destinataire}
                  </span>
                  <span role="cell">{jjmmaaaa(x.echeance)}</span>
                  <span role="cell" className="pi-pastilles">
                    <span className={`pill ${pill.classe}`}>{pill.libelle}</span>
                    <PastillesSuivi r={x} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {r && (
        <section className="panel glass-panel pi-fiche">
          <p className="po-kicker">
            {r.emetteur} → {r.destinataire} · échéance {jjmmaaaa(r.echeance)}
          </p>
          <h2>
            {r.titre} · {r.periode}
          </h2>
          <span className="pi-pastilles pi-fiche-statut">
            <span className={`pill ${pillStatut(r).classe}`}>{pillStatut(r).libelle}</span>
            <PastillesSuivi r={r} />
          </span>
          {r.contenu ? (
            <dl className="pi-rubriques">
              {r.contenu.map((c) => (
                <div key={c.libelle}>
                  <dt>{c.libelle}</dt>
                  <dd>{c.valeur}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="pi-aide">Contenu à fournir : aucune rubrique n’est encore définie pour ce reporting.</p>
          )}
          {!r.deposeLe && r.contenu && (
            <p className="pi-note">
              Prérempli automatiquement depuis le HUB : l’émetteur relit puis dépose. Sans dépôt au{' '}
              {jjmmaaaa(r.echeance)}, une alerte est inscrite au registre pour le CODIR.
            </p>
          )}
          {r.analyse ? (
            <div className="pi-analyse">
              <p className="po-kicker">Analyse de l’émetteur</p>
              <p>{r.analyse}</p>
            </div>
          ) : (
            r.peutDeposer && (
              <label className="field pi-analyse">
                <span className="field-label">Analyse (obligatoire)</span>
                <textarea
                  className="field-input"
                  rows={5}
                  maxLength={4000}
                  placeholder="Lecture des chiffres du mois, causes des écarts, actions proposées…"
                  value={analyse}
                  onChange={(e) => setAnalyses((a) => ({ ...a, [cle(r)]: e.target.value }))}
                />
              </label>
            )
          )}
          {erreur && <p className="field-erreur">{erreur}</p>}
          <SuiviReporting key={cle(r)} slug={slug} r={r} onVue={onVue} />
          {r.peutDeposer && (
            <button
              type="button"
              className="btn-primary pi-deposer"
              disabled={envoi || analyse.trim().length < 10}
              onClick={() => deposer(r)}
            >
              {envoi ? 'Dépôt…' : 'Déposer le reporting'}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
