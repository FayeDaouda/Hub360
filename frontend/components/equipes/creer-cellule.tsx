'use client';

import { useState } from 'react';
import { creerCellule } from '@/lib/equipe';
import { CLIENTELES, PROCESSUS, PROCESSUS_CREATION, STATUTS_CELLULE } from '@/lib/equipes';
import type { ClienteleCellule, ProcessusCellule, StatutCellule, VueEquipes } from '@/lib/types';

type Props = { slug: string; vue: VueEquipes; onCreee: () => void };

// Créer une cellule (maquette « Équipes ») : le code SOCIÉTÉ-PROCESSUS-NN est
// attribué par le serveur (jamais réutilisé) ; le pilote rejoint sa cellule.
export function CreerCellule({ slug, vue, onCreee }: Props) {
  const [processus, setProcessus] = useState<ProcessusCellule>('ARC');
  const [nom, setNom] = useState('');
  const [clientele, setClientele] = useState<ClienteleCellule>('externes');
  const [statut, setStatut] = useState<StatutCellule>('active');
  const [piloteId, setPiloteId] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer() {
    setEnvoi(true);
    setErreur(null);
    try {
      await creerCellule(slug, { processus, nom: nom.trim(), clientele, statut, piloteId: piloteId || null });
      setNom('');
      setPiloteId('');
      onCreee();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La cellule n’a pas pu être créée.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="panel glass-panel eq-creer" aria-labelledby="eq-creer-titre">
      <h2 id="eq-creer-titre">Créer une cellule</h2>
      <div className="eq-creer-grille">
        <label>
          <span>Processus</span>
          <select
            className="field-input"
            value={processus}
            onChange={(e) => setProcessus(e.target.value as ProcessusCellule)}
          >
            {PROCESSUS_CREATION.map((p) => (
              <option key={p} value={p}>
                {p} · {PROCESSUS[p].libelle}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Code attribué</span>
          <output className="eq-code-attribue">{vue.prochainsCodes[processus]}</output>
        </label>
        <label className="eq-creer-large">
          <span>Nom d’usage</span>
          <input
            className="field-input"
            value={nom}
            placeholder="ex. Architecture 5 — Clients externes"
            maxLength={120}
            onChange={(e) => setNom(e.target.value)}
          />
        </label>
        <label>
          <span>Clientèle</span>
          <select
            className="field-input"
            value={clientele}
            onChange={(e) => setClientele(e.target.value as ClienteleCellule)}
          >
            {(Object.keys(CLIENTELES) as ClienteleCellule[]).map((c) => (
              <option key={c} value={c}>
                {CLIENTELES[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Statut</span>
          <select className="field-input" value={statut} onChange={(e) => setStatut(e.target.value as StatutCellule)}>
            {(Object.keys(STATUTS_CELLULE) as StatutCellule[]).map((s) => (
              <option key={s} value={s}>
                {STATUTS_CELLULE[s].libelle}
              </option>
            ))}
          </select>
        </label>
        <label className="eq-creer-large">
          <span>Chef de cellule (pilote)</span>
          <select className="field-input" value={piloteId} onChange={(e) => setPiloteId(e.target.value)}>
            <option value="">À désigner</option>
            {vue.collaborateurs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
                {c.cellule ? ` · ${c.cellule}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {piloteId && <p className="eq-aide">Le pilote rejoint la nouvelle cellule ; son poste actuel se libère.</p>}
      {erreur && <p className="field-erreur">{erreur}</p>}
      <button type="button" className="btn-primary eq-creer-bouton" disabled={!nom.trim() || envoi} onClick={creer}>
        {envoi ? 'Création…' : 'Créer la cellule'}
      </button>
    </section>
  );
}
