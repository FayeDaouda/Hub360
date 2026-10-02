'use client';

import { CLIENTELES, ETATS_POSTE, PROCESSUS, STATUTS_CELLULE } from '@/lib/equipes';
import type { CelluleEquipe } from '@/lib/types';

type Props = {
  cellule: CelluleEquipe;
  cellules: CelluleEquipe[]; // destinations d'une réaffectation
  ecriture: boolean;
  onReaffecter: (collaborateurId: string, celluleId: string | null) => void;
};

const heures = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;

// Cellule (maquette « Équipes ») : code ISO 9001, statut, ponctualité, pilote,
// clientèle et clauses, postes, puis les membres — charge du mois, part des
// livrables à temps, cellule de rattachement (réaffectation en écriture).
export function CelluleCarte({ cellule: c, cellules, ecriture, onReaffecter }: Props) {
  const statut = STATUTS_CELLULE[c.statut];
  return (
    <section className={`panel glass-panel eq-cellule eq-cellule--${c.statut}`} aria-labelledby={`eq-${c.id}`}>
      <header className="eq-cellule-tete">
        <h2 id={`eq-${c.id}`}>
          <span className="eq-code">{c.code}</span> {c.nom}
        </h2>
        <span className="eq-badges">
          <span className={`pill pill--${statut.ton}`}>{statut.libelle}</span>
          <span className={`pill ${c.pctATemps == null ? 'pill--neutre' : 'pill--succes'}`}>
            {c.pctATemps == null ? 'pas encore d’étape livrée' : `${c.pctATemps} % à temps`}
          </span>
        </span>
      </header>
      <p className="eq-cellule-sous">
        Pilote : {c.pilote?.nom ?? 'à désigner'} · {CLIENTELES[c.clientele]} · {PROCESSUS[c.processus].iso}
      </p>

      {c.postes.length > 0 && (
        <ul className="eq-postes">
          {c.postes.map((p) => (
            <li key={p.id} className={`eq-poste eq-poste--${p.etat}`}>
              <strong>{p.libelle}</strong>
              <span>{p.titulaire?.nom ?? ETATS_POSTE[p.etat]}</span>
            </li>
          ))}
        </ul>
      )}

      {c.membres.length > 0 && (
        <ul className="eq-membres">
          {c.membres.map((m) => (
            <li key={m.id}>
              <span className="eq-membre">
                <strong>
                  {m.nom}
                  {m.estPilote && ' · pilote'}
                </strong>
                <small>{m.poste ?? m.role}</small>
              </span>
              <span className="eq-charge" title="Tâches du mois en cours · heures imputées à ce jour">
                {m.taches} tâche(s) · {heures(m.heures)}
              </span>
              <span className="eq-pct" title="Livrables validés à leur échéance">
                {m.pctATemps == null ? '—' : `${m.pctATemps} %`}
              </span>
              <select
                className="field-input eq-affectation"
                aria-label={`Cellule de ${m.nom}`}
                value={c.id}
                disabled={!ecriture}
                onChange={(e) => onReaffecter(m.id, e.target.value || null)}
              >
                {cellules.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.nom}
                  </option>
                ))}
                <option value="">Sans cellule</option>
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
