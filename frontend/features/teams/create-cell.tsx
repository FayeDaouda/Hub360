'use client';

import { useState } from 'react';
import { FieldError } from '@/components/ui/field';
import { createCell } from './api';
import { CELL_STATUSES, CLIENTELES, CREATION_ORDER, PROCESSES } from './constants';
import type { CellClientele, CellProcess, CellStatus, TeamsView } from './types';

type Props = { slug: string; view: TeamsView; onCreated: () => void };

// Créer une cellule (maquette « Équipes ») : le code SOCIÉTÉ-PROCESSUS-NN est
// attribué par le serveur (jamais réutilisé) ; le pilote rejoint sa cellule.
export function CreateCell({ slug, view, onCreated }: Props) {
  const [process, setProcess] = useState<CellProcess>('ARC');
  const [name, setName] = useState('');
  const [clientele, setClientele] = useState<CellClientele>('externes');
  const [status, setStatus] = useState<CellStatus>('active');
  const [pilotId, setPilotId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSending(true);
    setError(null);
    try {
      await createCell(slug, {
        processus: process,
        nom: name.trim(),
        clientele,
        statut: status,
        piloteId: pilotId || null,
      });
      setName('');
      setPilotId('');
      onCreated();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'La cellule n’a pas pu être créée.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="panel glass-panel eq-creer" aria-labelledby="eq-creer-titre">
      <h2 id="eq-creer-titre">Créer une cellule</h2>
      <div className="eq-creer-grille">
        <label>
          <span>Processus</span>
          <select className="field-input" value={process} onChange={(e) => setProcess(e.target.value as CellProcess)}>
            {CREATION_ORDER.map((p) => (
              <option key={p} value={p}>
                {p} · {PROCESSES[p].libelle}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Code attribué</span>
          <output className="eq-code-attribue">{view.prochainsCodes[process]}</output>
        </label>
        <label className="eq-creer-large">
          <span>Nom d’usage</span>
          <input
            className="field-input"
            value={name}
            placeholder="ex. Architecture 5 — Clients externes"
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          <span>Clientèle</span>
          <select
            className="field-input"
            value={clientele}
            onChange={(e) => setClientele(e.target.value as CellClientele)}
          >
            {(Object.keys(CLIENTELES) as CellClientele[]).map((c) => (
              <option key={c} value={c}>
                {CLIENTELES[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Statut</span>
          <select className="field-input" value={status} onChange={(e) => setStatus(e.target.value as CellStatus)}>
            {(Object.keys(CELL_STATUSES) as CellStatus[]).map((s) => (
              <option key={s} value={s}>
                {CELL_STATUSES[s].libelle}
              </option>
            ))}
          </select>
        </label>
        <label className="eq-creer-large">
          <span>Chef de cellule (pilote)</span>
          <select className="field-input" value={pilotId} onChange={(e) => setPilotId(e.target.value)}>
            <option value="">À désigner</option>
            {view.collaborateurs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
                {c.cellule ? ` · ${c.cellule}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pilotId && <p className="eq-aide">Le pilote rejoint la nouvelle cellule ; son poste actuel se libère.</p>}
      {error && <FieldError>{error}</FieldError>}
      <button type="button" className="btn-primary eq-creer-bouton" disabled={!name.trim() || sending} onClick={create}>
        {sending ? 'Création…' : 'Créer la cellule'}
      </button>
    </section>
  );
}
