'use client';

import { DecisionsFiche } from '@/components/pilotage/decisions-fiche';
import { CLIENTELES, ETATS_POSTE, PROCESSUS, STATUTS_CELLULE } from '@/lib/equipes';
import { estImage, lireImageRedimensionnee } from '@/lib/image-fichier';
import { NIVEAUX_COLLABORATEUR, type CelluleEquipe, type NiveauCollaborateur } from '@/lib/types';
import { couleurPersonne, srcPhoto } from '@/lib/profil';
import { ancreCellule } from './sommaire-cellules';

type Props = {
  slug: string;
  cellule: CelluleEquipe;
  cellules: CelluleEquipe[]; // destinations d'une réaffectation
  ecriture: boolean;
  onReaffecter: (collaborateurId: string, celluleId: string | null) => void;
  // Reprises de l'ancienne page Équipe (phase 1, G1 à G4) — en écriture.
  onRenommer: (cellule: CelluleEquipe) => void;
  onSupprimer: (cellule: CelluleEquipe) => void;
  onPilote: (celluleId: string, collaborateurId: string | null) => void;
  onMajMembre: (collaborateurId: string, patch: { niveau?: NiveauCollaborateur; photo?: string | null }) => void;
};

const heures = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;

// Cellule (maquette « Équipes ») : code ISO 9001, statut, ponctualité, pilote,
// clientèle et clauses, postes, puis les membres — charge du mois, part des
// livrables à temps, cellule de rattachement (réaffectation en écriture).
export function CelluleCarte({
  slug,
  cellule: c,
  cellules,
  ecriture,
  onReaffecter,
  onRenommer,
  onSupprimer,
  onPilote,
  onMajMembre,
}: Props) {
  const statut = STATUTS_CELLULE[c.statut];

  async function choisirPhoto(collaborateurId: string, f: File | undefined) {
    if (!f || !estImage(f)) return;
    const { url } = await lireImageRedimensionnee(f);
    onMajMembre(collaborateurId, { photo: url });
  }

  return (
    <section id={ancreCellule(c.id)} className={`panel glass-panel eq-cellule eq-cellule--${c.statut}`} aria-labelledby={`eq-${c.id}`}>
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
        Pilote :{' '}
        {ecriture && c.membres.length > 0 ? (
          // Le pilote est le chef de team de la cellule (dispatcher) : il
          // valide les tâches de ses membres — choisi parmi eux.
          <select
            className="field-input eq-pilote"
            aria-label={`Pilote de ${c.nom}`}
            value={c.pilote?.id ?? ''}
            onChange={(e) => onPilote(c.id, e.target.value || null)}
          >
            <option value="">À désigner</option>
            {c.membres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
        ) : (
          (c.pilote?.nom ?? 'à désigner')
        )}{' '}
        · {CLIENTELES[c.clientele]} · {PROCESSUS[c.processus].iso}
      </p>
      {/* Détail (remontée au Dir. GC) : un seul bandeau en tête de la liste. */}
      {c.pilote?.sansCompte && <span className="pill pill--attention eq-sans-compte">Pilote sans compte HUB</span>}
      <DecisionsFiche slug={slug} cible={{ cellule: c.id }} />
      {ecriture && (
        <div className="eq-cellule-actions">
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => onRenommer(c)}>
            Renommer
          </button>
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            onClick={() => onSupprimer(c)}
            title={c.membres.length ? 'Réaffectez d’abord ses membres' : undefined}
          >
            Supprimer
          </button>
        </div>
      )}

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
              <label
                className={`eq-avatar${ecriture ? ' eq-avatar--modifiable' : ''}`}
                style={m.photoUrl ? { backgroundImage: `url(${srcPhoto(m.photoUrl)})` } : { background: couleurPersonne(m.id) }}
                title={
                  [m.absentJusquau ? `Absent·e jusqu’au ${m.absentJusquau.split('-').reverse().slice(0, 2).join('/')}` : null, ecriture ? `Changer la photo de ${m.nom}` : null]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              >
                {m.absentJusquau && <span className="av-absent" aria-label="Absent aujourd'hui" />}
                {!m.photoUrl &&
                  m.nom
                    .split(' ')
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join('')}
                {ecriture && (
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    aria-label={`Photo de ${m.nom}`}
                    onChange={(e) => choisirPhoto(m.id, e.target.files?.[0])}
                  />
                )}
              </label>
              <span className="eq-membre">
                <strong>
                  {m.nom}
                  {m.estPilote && ' · pilote'}
                </strong>
                <small>
                  {m.poste ?? m.role} ·{' '}
                  {ecriture ? (
                    <select
                      className="eq-niveau"
                      aria-label={`Niveau de ${m.nom}`}
                      value={m.niveau}
                      onChange={(e) => onMajMembre(m.id, { niveau: e.target.value as NiveauCollaborateur })}
                    >
                      {(Object.keys(NIVEAUX_COLLABORATEUR) as NiveauCollaborateur[]).map((n) => (
                        <option key={n} value={n}>
                          {NIVEAUX_COLLABORATEUR[n]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    NIVEAUX_COLLABORATEUR[m.niveau]
                  )}
                </small>
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
