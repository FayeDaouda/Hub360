'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChampModal } from '@/components/admin/champ-modal';
import { arbitrerDecision, cloturerDecision, saisirDecision, type ArbitrageDecision } from '@/lib/pilotage';
import type { DecisionRegistre, ResponsableDecision, StatutDecision, VuePilotage } from '@/lib/types';
import { daysSince, formatDate, todayIso } from '@hub/domain';
import { Pill } from '@/components/ui/pill';
import { FieldError } from '@/components/ui/field';

const PILL_STATUT: Record<StatutDecision, string> = {
  proposee: 'pill--attention',
  refusee: 'pill--neutre',
  ouverte: 'pill--azur',
  echeance_depassee: 'pill--risque',
  close: 'pill--succes',
};
const libelleStatut = (d: DecisionRegistre) =>
  d.statut === 'proposee'
    ? 'Proposée au CEO'
    : d.statut === 'refusee'
      ? 'Refusée'
      : d.statut === 'ouverte'
        ? 'Ouverte'
        : d.statut === 'echeance_depassee'
          ? 'Échéance dépassée'
          : `Close le ${formatDate(d.closeLe ?? '')}`;

const valeurResponsable = (r: ResponsableDecision) =>
  'role' in r ? `role:${r.role}` : `collaborateur:${r.collaborateurId}`;
// « role:Dir. GC » → { responsableRole } ; « collaborateur:id » → { responsableCollaborateurId }.
const champsResponsable = (valeur: string) => {
  const [genre, id] = valeur.split(/:(.*)/s);
  return genre === 'role' ? { responsableRole: id } : { responsableCollaborateurId: id };
};
const valeurDe = (d: DecisionRegistre) =>
  d.responsableRole
    ? `role:${d.responsableRole}`
    : d.responsableCollaborateurId
      ? `collaborateur:${d.responsableCollaborateurId}`
      : '';

// Trace d'une proposition CTO → CEO, sous le texte de la décision.
function traceProposition(d: DecisionRegistre): string | null {
  const p = d.proposition;
  if (!p) return null;
  const par = p.par ? ` par ${p.par}` : '';
  if (p.etat === 'proposee') {
    const jours = Math.max(0, daysSince(d.date));
    return `Proposée${par} · en attente du CEO depuis ${jours} j`;
  }
  const arbitre = `${p.arbitreLe ? ` le ${formatDate(p.arbitreLe)}` : ''}${p.arbitrePar ? ` par ${p.arbitrePar}` : ''}`;
  if (p.etat === 'refusee') return `Proposée${par} · refusée${arbitre}${p.motif ? ` · « ${p.motif} »` : ''}`;
  if (!p.initiale) return `Proposée${par} · acceptée${arbitre}`;
  const i = p.initiale;
  return `Proposée${par} · acceptée avec modifications${arbitre}${p.motif ? ` (« ${p.motif} »)` : ''} · proposition d’origine : « ${i.texte} », ${i.responsable}${
    i.echeance ? `, échéance ${formatDate(i.echeance)}` : ''
  }`;
}

// Registre des décisions (manuel §4.1) : décision, responsable, échéance.
// Les décisions prises dans le HUB s'inscrivent seules et se closent seules ;
// celles des instances se saisissent ici (CTO, CEO) et se clôturent par leur
// responsable, le CTO ou le CEO.
export function Registre({ slug, vue, onVue }: { slug: string; vue: VuePilotage; onVue: (v: VuePilotage) => void }) {
  const [filtre, setFiltre] = useState<'ouvertes' | 'toutes'>('ouvertes');
  const [saisie, setSaisie] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aModifier, setAModifier] = useState<DecisionRegistre | null>(null);
  const [aRefuser, setARefuser] = useState<DecisionRegistre | null>(null);
  // Ouvertes : les propositions en attente d'abord (le CEO les tranche).
  const ouvertes = vue.decisions
    .filter((d) => d.statut === 'proposee' || d.statut === 'ouverte' || d.statut === 'echeance_depassee')
    .sort((a, b) => Number(b.statut === 'proposee') - Number(a.statut === 'proposee'));
  const liste = filtre === 'ouvertes' ? ouvertes : vue.decisions;

  async function arbitrer(d: DecisionRegistre, arbitrage: ArbitrageDecision) {
    setEnCours(d.id);
    setErreur(null);
    try {
      onVue(await arbitrerDecision(slug, d.id, arbitrage));
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’arbitrage a échoué.');
    } finally {
      setEnCours(null);
    }
  }

  async function cloturer(d: DecisionRegistre) {
    setEnCours(d.id);
    setErreur(null);
    try {
      onVue(await cloturerDecision(slug, d.id));
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La clôture a échoué.');
    } finally {
      setEnCours(null);
    }
  }

  return (
    <section className="panel glass-panel pi-liste">
      <header className="pi-registre-tete">
        <div>
          <h2>Registre des décisions (manuel §4.1)</h2>
          <p className="pi-aide">
            Décision, responsable, échéance. Les décisions prises dans le HUB s’inscrivent seules ; celles des instances
            se saisissent ici.
          </p>
        </div>
        <div className="pi-registre-actions">
          {vue.saisie && !saisie && (
            <button type="button" className="btn-ghost" onClick={() => setSaisie(true)}>
              {vue.saisie.peutInscrire ? 'Saisir une décision' : 'Proposer une décision'}
            </button>
          )}
          <div className="vue-toggle" role="group" aria-label="Décisions">
            <button
              type="button"
              className={filtre === 'ouvertes' ? 'is-active' : ''}
              aria-pressed={filtre === 'ouvertes'}
              onClick={() => setFiltre('ouvertes')}
            >
              Ouvertes · {ouvertes.length}
            </button>
            <button
              type="button"
              className={filtre === 'toutes' ? 'is-active' : ''}
              aria-pressed={filtre === 'toutes'}
              onClick={() => setFiltre('toutes')}
            >
              Toutes · {vue.decisions.length}
            </button>
          </div>
        </div>
      </header>

      {vue.saisie && saisie && (
        <SaisieDecision slug={slug} saisie={vue.saisie} onVue={onVue} onFermer={() => setSaisie(false)} />
      )}
      {vue.saisie && aModifier && (
        <ModifierProposition
          key={aModifier.id}
          slug={slug}
          decision={aModifier}
          saisie={vue.saisie}
          onVue={onVue}
          onFermer={() => setAModifier(null)}
        />
      )}
      {erreur && <FieldError>{erreur}</FieldError>}

      {liste.length === 0 ? (
        <p className="pi-aide">{filtre === 'ouvertes' ? 'Aucune décision ouverte.' : 'Le registre est vide.'}</p>
      ) : (
        <div className="pi-table" role="table">
          <div className="pi-ligne pi-ligne--tete pi-ligne--decision" role="row">
            <span role="columnheader">N°</span>
            <span role="columnheader">Date</span>
            <span role="columnheader">Instance</span>
            <span role="columnheader">Décision</span>
            <span role="columnheader">Responsable</span>
            <span role="columnheader">Échéance</span>
            <span role="columnheader">Statut</span>
          </div>
          {liste.map((d) => (
            <div key={d.id} className="pi-ligne pi-ligne--decision" role="row">
              <span role="cell" className="po-code pi-numero">
                {d.numero}
              </span>
              <span role="cell" className="pi-date">
                {formatDate(d.date)}
              </span>
              <span role="cell" className="pi-instance">
                <strong>{d.instance}</strong>
                <small>
                  {d.origine === 'hub' ? 'inscrite par le HUB' : d.proposition ? 'proposée au CEO' : 'saisie'}
                </small>
              </span>
              <span role="cell" className="pi-texte">
                {d.texte}
                {traceProposition(d) && <small className="pi-proposition">{traceProposition(d)}</small>}
                {d.rattachement && (
                  <small className="pi-rattachement">
                    {d.rattachement.type === 'projet'
                      ? 'Projet'
                      : d.rattachement.type === 'cellule'
                        ? 'Cellule'
                        : 'Client'}{' '}
                    · {d.rattachement.libelle}
                  </small>
                )}
              </span>
              <span role="cell">{d.responsable}</span>
              <span role="cell" className={d.statut === 'echeance_depassee' ? 'pi-echeance--depassee' : undefined}>
                {d.echeance ? formatDate(d.echeance) : '—'}
              </span>
              <span role="cell" className="pi-statut">
                <Pill className={PILL_STATUT[d.statut]}>{libelleStatut(d)}</Pill>
                {d.peutCloturer && (
                  <button
                    type="button"
                    className="btn-ghost pi-cloturer"
                    disabled={enCours === d.id}
                    onClick={() => cloturer(d)}
                  >
                    {enCours === d.id ? '…' : 'Clôturer'}
                  </button>
                )}
                {d.peutArbitrer && (
                  <span className="pi-arbitrage">
                    <button
                      type="button"
                      className="btn-primary pi-cloturer"
                      disabled={enCours === d.id}
                      onClick={() => arbitrer(d, { issue: 'accepter' })}
                    >
                      {enCours === d.id ? '…' : 'Accepter'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost pi-cloturer"
                      disabled={enCours === d.id}
                      onClick={() => setAModifier(d)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="btn-ghost pi-cloturer"
                      disabled={enCours === d.id}
                      onClick={() => setARefuser(d)}
                    >
                      Refuser
                    </button>
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* Hors du panneau « glass » : une modale fixe y serait piégée. */}
      {aRefuser &&
        createPortal(
          <ChampModal
            titre={`Refuser ${aRefuser.numero}`}
            label="Motif du refus (transmis au CTO)"
            confirmer="Refuser la décision"
            onSubmit={async (motif) => {
              if (motif.trim().length < 3) throw new Error('Le motif du refus est obligatoire.');
              onVue(await arbitrerDecision(slug, aRefuser.id, { issue: 'refuser', motif: motif.trim() }));
              setARefuser(null);
            }}
            onClose={() => setARefuser(null)}
          />,
          document.body,
        )}
    </section>
  );
}

// Choix du responsable : fonctions pourvues, puis collaborateurs ayant un compte.
function ChoixResponsable({
  responsables,
  valeur,
  onChange,
}: {
  responsables: ResponsableDecision[];
  valeur: string;
  onChange: (v: string) => void;
}) {
  const roles = responsables.filter((r) => 'role' in r);
  const collaborateurs = responsables.filter((r) => 'collaborateurId' in r);
  return (
    <select className="field-input" value={valeur} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choisir…</option>
      <optgroup label="Fonctions">
        {roles.map((r) => (
          <option key={valeurResponsable(r)} value={valeurResponsable(r)}>
            {r.libelle}
          </option>
        ))}
      </optgroup>
      <optgroup label="Collaborateurs">
        {collaborateurs.map((r) => (
          <option key={valeurResponsable(r)} value={valeurResponsable(r)}>
            {r.libelle}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

// CEO : accepter une proposition du CTO après l'avoir modifiée. La
// proposition d'origine reste tracée au registre.
function ModifierProposition({
  slug,
  decision,
  saisie,
  onVue,
  onFermer,
}: {
  slug: string;
  decision: DecisionRegistre;
  saisie: NonNullable<VuePilotage['saisie']>;
  onVue: (v: VuePilotage) => void;
  onFermer: () => void;
}) {
  const [texte, setTexte] = useState(decision.texte);
  const [responsable, setResponsable] = useState(valeurDe(decision));
  const [echeance, setEcheance] = useState(decision.echeance ?? '');
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function accepter() {
    setEnvoi(true);
    setErreur(null);
    try {
      onVue(
        await arbitrerDecision(slug, decision.id, {
          issue: 'modifier',
          texte: texte.trim(),
          ...(responsable !== valeurDe(decision) ? champsResponsable(responsable) : {}),
          echeance,
          ...(motif.trim() ? { motif: motif.trim() } : {}),
        }),
      );
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La modification a échoué.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="pi-saisie">
      <p className="pi-aide">
        Modifier puis accepter <strong>{decision.numero}</strong>
        {decision.proposition?.par ? `, proposée par ${decision.proposition.par}` : ''}. La proposition d’origine reste
        au registre.
      </p>
      <div className="eq-creer-grille pi-saisie-grille">
        <label className="eq-creer-large">
          <span>Décision</span>
          <textarea
            className="field-input"
            rows={2}
            maxLength={500}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
          />
        </label>
        <label>
          <span>Responsable</span>
          <ChoixResponsable responsables={saisie.responsables} valeur={responsable} onChange={setResponsable} />
        </label>
        <label>
          <span>Échéance</span>
          <input
            className="field-input"
            type="date"
            value={echeance}
            min={todayIso()}
            onChange={(e) => setEcheance(e.target.value)}
          />
        </label>
        <label className="eq-creer-large">
          <span>Note au CTO (facultatif)</span>
          <input className="field-input" maxLength={1000} value={motif} onChange={(e) => setMotif(e.target.value)} />
        </label>
      </div>
      {erreur && <FieldError>{erreur}</FieldError>}
      <div className="pi-saisie-actions">
        <button type="button" className="btn-ghost" onClick={onFermer}>
          Annuler
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={envoi || texte.trim().length < 3 || !responsable || !echeance}
          onClick={accepter}
        >
          {envoi ? 'Acceptation…' : 'Accepter avec ces modifications'}
        </button>
      </div>
    </div>
  );
}

function SaisieDecision({
  slug,
  saisie,
  onVue,
  onFermer,
}: {
  slug: string;
  saisie: NonNullable<VuePilotage['saisie']>;
  onVue: (v: VuePilotage) => void;
  onFermer: () => void;
}) {
  const [instance, setInstance] = useState(saisie.instances[0] ?? '');
  const [date, setDate] = useState(todayIso());
  const [texte, setTexte] = useState('');
  const [responsable, setResponsable] = useState('');
  const [echeance, setEcheance] = useState('');
  // Rattachement facultatif : « projet:id », « cellule:id » ou « client:id ».
  const [rattache, setRattache] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // `proposer` (CTO) : soumise au CEO, en vigueur seulement une fois acceptée.
  async function enregistrer(proposer: boolean) {
    const [typeR, idR] = rattache ? rattache.split(/:(.*)/s) : ['', ''];
    setEnvoi(true);
    setErreur(null);
    try {
      onVue(
        await saisirDecision(slug, {
          instance,
          texte: texte.trim(),
          date,
          ...champsResponsable(responsable),
          echeance,
          ...(proposer ? { proposer: true } : {}),
          ...(typeR === 'projet'
            ? { projetId: idR }
            : typeR === 'cellule'
              ? { celluleId: idR }
              : typeR === 'client'
                ? { clientId: idR }
                : {}),
        }),
      );
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La saisie a échoué.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="pi-saisie">
      <div className="eq-creer-grille pi-saisie-grille">
        <label>
          <span>Instance</span>
          <select className="field-input" value={instance} onChange={(e) => setInstance(e.target.value)}>
            {saisie.instances.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Date de la décision</span>
          <input
            className="field-input"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="eq-creer-large">
          <span>Décision</span>
          <textarea
            className="field-input"
            rows={2}
            maxLength={500}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
          />
        </label>
        <label>
          <span>Responsable</span>
          <ChoixResponsable responsables={saisie.responsables} valeur={responsable} onChange={setResponsable} />
        </label>
        <label>
          <span>Échéance</span>
          <input
            className="field-input"
            type="date"
            value={echeance}
            min={date}
            onChange={(e) => setEcheance(e.target.value)}
          />
        </label>
        {saisie.rattachables && (
          <label>
            <span>Rattachée à (facultatif)</span>
            <select className="field-input" value={rattache} onChange={(e) => setRattache(e.target.value)}>
              <option value="">Aucun rattachement</option>
              {(
                [
                  ['projet', 'Projets', saisie.rattachables.projets],
                  ['cellule', 'Cellules', saisie.rattachables.cellules],
                  ['client', 'Clients', saisie.rattachables.clients],
                ] as const
              ).map(([type, libelle, options]) => (
                <optgroup key={type} label={libelle}>
                  {options.map((o) => (
                    <option key={o.id} value={`${type}:${o.id}`}>
                      {o.libelle}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
      </div>
      {saisie.peutProposer && (
        <p className="pi-aide">
          {saisie.peutInscrire ? '« Proposer au CEO » : la' : 'La'} décision attend l’accord du CEO (accepter, modifier
          ou refuser) avant d’entrer en vigueur.
        </p>
      )}
      {erreur && <FieldError>{erreur}</FieldError>}
      <div className="pi-saisie-actions">
        <button type="button" className="btn-ghost" onClick={onFermer}>
          Annuler
        </button>
        {saisie.peutProposer && (
          <button
            type="button"
            className={saisie.peutInscrire ? 'btn-ghost' : 'btn-primary'}
            disabled={envoi || texte.trim().length < 3 || !responsable || !date || !echeance}
            onClick={() => enregistrer(true)}
          >
            {envoi && !saisie.peutInscrire ? 'Envoi…' : 'Proposer au CEO'}
          </button>
        )}
        {saisie.peutInscrire && (
          <button
            type="button"
            className="btn-primary"
            disabled={envoi || texte.trim().length < 3 || !responsable || !date || !echeance}
            onClick={() => enregistrer(false)}
          >
            {envoi ? 'Envoi…' : 'Inscrire au registre'}
          </button>
        )}
      </div>
    </div>
  );
}
