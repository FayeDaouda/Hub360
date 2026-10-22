'use client';

import { useState } from 'react';
import { cloturerDecision, saisirDecision } from '@/lib/pilotage';
import type { DecisionRegistre, ResponsableDecision, StatutDecision, VuePilotage } from '@/lib/types';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const aujourdhui = () => new Date().toISOString().slice(0, 10);

const PILL_STATUT: Record<StatutDecision, string> = {
  ouverte: 'pill--azur',
  echeance_depassee: 'pill--risque',
  close: 'pill--succes',
};
const libelleStatut = (d: DecisionRegistre) =>
  d.statut === 'ouverte' ? 'Ouverte' : d.statut === 'echeance_depassee' ? 'Échéance dépassée' : `Close le ${jjmmaaaa(d.closeLe ?? '')}`;

const valeurResponsable = (r: ResponsableDecision) => ('role' in r ? `role:${r.role}` : `collaborateur:${r.collaborateurId}`);

// Registre des décisions (manuel §4.1) : décision, responsable, échéance.
// Les décisions prises dans le HUB s'inscrivent seules et se closent seules ;
// celles des instances se saisissent ici (CTO, CEO) et se clôturent par leur
// responsable, le CTO ou le CEO.
export function Registre({ slug, vue, onVue }: { slug: string; vue: VuePilotage; onVue: (v: VuePilotage) => void }) {
  const [filtre, setFiltre] = useState<'ouvertes' | 'toutes'>('ouvertes');
  const [saisie, setSaisie] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const ouvertes = vue.decisions.filter((d) => d.statut !== 'close');
  const liste = filtre === 'ouvertes' ? ouvertes : vue.decisions;

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
          <p className="pi-aide">Décision, responsable, échéance. Les décisions prises dans le HUB s’inscrivent seules ; celles des instances se saisissent ici.</p>
        </div>
        <div className="pi-registre-actions">
          {vue.saisie && !saisie && (
            <button type="button" className="btn-ghost" onClick={() => setSaisie(true)}>
              Saisir une décision
            </button>
          )}
          <div className="vue-toggle" role="group" aria-label="Décisions">
            <button type="button" className={filtre === 'ouvertes' ? 'is-active' : ''} aria-pressed={filtre === 'ouvertes'} onClick={() => setFiltre('ouvertes')}>
              Ouvertes · {ouvertes.length}
            </button>
            <button type="button" className={filtre === 'toutes' ? 'is-active' : ''} aria-pressed={filtre === 'toutes'} onClick={() => setFiltre('toutes')}>
              Toutes · {vue.decisions.length}
            </button>
          </div>
        </div>
      </header>

      {vue.saisie && saisie && <SaisieDecision slug={slug} saisie={vue.saisie} onVue={onVue} onFermer={() => setSaisie(false)} />}
      {erreur && <p className="field-erreur">{erreur}</p>}

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
                {jjmmaaaa(d.date)}
              </span>
              <span role="cell" className="pi-instance">
                <strong>{d.instance}</strong>
                <small>{d.origine === 'hub' ? 'inscrite par le HUB' : 'saisie'}</small>
              </span>
              <span role="cell" className="pi-texte">
                {d.texte}
                {d.rattachement && (
                  <small className="pi-rattachement">
                    {d.rattachement.type === 'projet' ? 'Projet' : d.rattachement.type === 'cellule' ? 'Cellule' : 'Client'} · {d.rattachement.libelle}
                  </small>
                )}
              </span>
              <span role="cell">{d.responsable}</span>
              <span role="cell" className={d.statut === 'echeance_depassee' ? 'pi-echeance--depassee' : undefined}>
                {d.echeance ? jjmmaaaa(d.echeance) : '—'}
              </span>
              <span role="cell" className="pi-statut">
                <span className={`pill ${PILL_STATUT[d.statut]}`}>{libelleStatut(d)}</span>
                {d.peutCloturer && (
                  <button type="button" className="btn-ghost pi-cloturer" disabled={enCours === d.id} onClick={() => cloturer(d)}>
                    {enCours === d.id ? '…' : 'Clôturer'}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
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
  const [date, setDate] = useState(aujourdhui());
  const [texte, setTexte] = useState('');
  const [responsable, setResponsable] = useState('');
  const [echeance, setEcheance] = useState('');
  // Rattachement facultatif : « projet:id », « cellule:id » ou « client:id ».
  const [rattache, setRattache] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const roles = saisie.responsables.filter((r) => 'role' in r);
  const collaborateurs = saisie.responsables.filter((r) => 'collaborateurId' in r);

  async function enregistrer() {
    const [genre, id] = responsable.split(/:(.*)/s);
    const [typeR, idR] = rattache ? rattache.split(/:(.*)/s) : ['', ''];
    setEnvoi(true);
    setErreur(null);
    try {
      onVue(
        await saisirDecision(slug, {
          instance,
          texte: texte.trim(),
          date,
          ...(genre === 'role' ? { responsableRole: id } : { responsableCollaborateurId: id }),
          echeance,
          ...(typeR === 'projet' ? { projetId: idR } : typeR === 'cellule' ? { celluleId: idR } : typeR === 'client' ? { clientId: idR } : {}),
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
          <input className="field-input" type="date" value={date} max={aujourdhui()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="eq-creer-large">
          <span>Décision</span>
          <textarea className="field-input" rows={2} maxLength={500} value={texte} onChange={(e) => setTexte(e.target.value)} />
        </label>
        <label>
          <span>Responsable</span>
          <select className="field-input" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
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
        </label>
        <label>
          <span>Échéance</span>
          <input className="field-input" type="date" value={echeance} min={date} onChange={(e) => setEcheance(e.target.value)} />
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
      {erreur && <p className="field-erreur">{erreur}</p>}
      <div className="pi-saisie-actions">
        <button type="button" className="btn-ghost" onClick={onFermer}>
          Annuler
        </button>
        <button type="button" className="btn-primary" disabled={envoi || texte.trim().length < 3 || !responsable || !date || !echeance} onClick={enregistrer}>
          {envoi ? 'Inscription…' : 'Inscrire au registre'}
        </button>
      </div>
    </div>
  );
}
