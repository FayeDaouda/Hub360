'use client';

import { useEffect, useState } from 'react';
import {
  assignerTache,
  getHistoriqueTache,
  jjmmaaaa,
  numeroEtape,
  pastilleTache,
  type Assignable,
  type CarteOuverte,
  type EvenementTache,
  type TacheOuverte,
} from '@/lib/projets-ouverts';
import { FilDiscussion } from './fil-discussion';

type Props = {
  slug: string;
  projetId: string;
  code: string;
  carte: CarteOuverte;
  tache: TacheOuverte;
  // null = pas le droit d'assigner (lecture seule).
  assignables: Assignable[] | null;
  moiId: string;
  // null = lecture seule du fil.
  mentionnables: { id: string; nom: string }[] | null;
  onMaj: () => Promise<void>;
};

// Panneau d'une tâche (maquette « Projets ») : qui, qui valide, durée,
// fenêtre et échéance figées, écart, descriptif, assignation (à la tâche ou à
// toute la carte), fichiers, fil de discussion et historique. Remise et
// validation : avec les vues chef de team et collaborateur.
export function TachePanneau({ slug, projetId, code, carte, tache, assignables, moiId, mentionnables, onMaj }: Props) {
  const [aLaCarte, setALaCarte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [historique, setHistorique] = useState<EvenementTache[] | null>(null);

  // Rechargé quand la tâche change ou que son assigné change (nouvelle ligne).
  useEffect(() => {
    let annule = false;
    setHistorique(null);
    getHistoriqueTache(slug, projetId, tache.id)
      .then((h) => !annule && setHistorique(h))
      .catch(() => !annule && setHistorique([]));
    return () => {
      annule = true;
    };
  }, [slug, projetId, tache.id, tache.assigne?.id]);

  useEffect(() => {
    setALaCarte(false);
    setErreur(null);
  }, [tache.id]);

  async function assigner(collaborateurId: string) {
    setEnCours(true);
    setErreur(null);
    try {
      await assignerTache(slug, projetId, tache.id, collaborateurId || null, aLaCarte);
      // Portée « carte » : un seul usage, pour qu'un changement suivant ne
      // réassigne pas toute la carte par mégarde.
      setALaCarte(false);
      await onMaj();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’assignation a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  const pastille = pastilleTache(tache.etat);
  const ecart = tache.etat.code === 'validee' ? tache.etat.ecart : null;
  const v = tache.validation;
  const assignable =
    assignables !== null && carte.etat.code !== 'desactivee' && tache.statut !== 'validee' && tache.statut !== 'non_necessaire';
  const lignes: [string, React.ReactNode][] = [
    ['Assignée à', tache.assigne?.nom ?? 'À assigner'],
    [
      'Validation',
      v.mode === 'depot' ? 'dépôt du justificatif = validation (exception écrite au principe 4)' : `${v.nom ?? 'à désigner'} · ${v.role}`,
    ],
    ['Durée standard', dureeStandard(tache)],
    [
      'Fenêtre',
      tache.debutJ !== null && tache.debutLe && tache.finLe
        ? `J${tache.debutJ} → J${tache.finJ} · ${jjmmaaaa(tache.debutLe)} → ${jjmmaaaa(tache.finLe)}`
        : '—',
    ],
    ['Échéance de référence', tache.finLe ? `${jjmmaaaa(tache.finLe)} · délai figé` : '—'],
  ];
  if (ecart) {
    lignes.push([
      'Écart (performance)',
      <span key="ecart" className={ecart > 0 ? 'po-avance' : 'po-retard'}>
        {ecart > 0 ? `${ecart} h d’avance à la remise` : `${-ecart} h de retard à la remise`}
      </span>,
    ]);
  }
  if (tache.valideeLe) {
    lignes.push(['Validée', `le ${jjmmaaaa(tache.valideeLe)}${tache.valideePar ? ` par ${tache.valideePar}` : ''}${v.mode === 'depot' ? ' (dépôt)' : ''}`]);
  }

  return (
    <aside className="po-panneau" aria-label={`Tâche ${tache.libelle}`}>
      <p className="po-kicker">
        {numeroEtape(carte.etapeNumero)} {carte.etapeLibelle} · {carte.libelle}
      </p>
      <h3 className="po-panneau-titre">{tache.libelle}</h3>
      <div className="po-pastilles">
        <span className={`po-pastille po-pastille--${pastille.ton}`}>{pastille.libelle}</span>
        {tache.sourceNative && <span className="po-pastille po-pastille--validation">source native exigée</span>}
      </div>
      <dl className="po-panneau-lignes">
        {lignes.map(([dt, dd]) => (
          <div key={dt}>
            <dt>{dt}</dt>
            <dd>{dd}</dd>
          </div>
        ))}
      </dl>
      {tache.etat.code === 'non_necessaire' && tache.motif && <p className="po-panneau-note">Non nécessaire : {tache.motif}.</p>}
      {carte.etat.code === 'desactivee' && (
        <p className="po-panneau-note">Carte désactivée : {carte.etat.motif}. Son temps n’est pas compté.</p>
      )}
      {tache.descriptif && (
        <div className="po-descriptif">
          <p className="po-kicker">Descriptif</p>
          <p>{tache.descriptif}</p>
        </div>
      )}
      {assignable && (
        <div className="po-panneau-bloc">
          <label className="po-panneau-label" htmlFor="po-assigner">
            Assigner
          </label>
          <select
            id="po-assigner"
            className="field-input"
            value={tache.assigne?.id ?? ''}
            disabled={enCours}
            onChange={(e) => assigner(e.target.value)}
          >
            <option value="">À assigner</option>
            {assignables.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom}
                {a.cellule ? ` · ${a.cellule}` : ''}
              </option>
            ))}
          </select>
          {carte.taches.length > 1 && (
            <label className="po-case">
              <input type="checkbox" checked={aLaCarte} disabled={enCours} onChange={(e) => setALaCarte(e.target.checked)} />
              <span>Toute la carte « {carte.libelle} » (ses tâches encore ouvertes)</span>
            </label>
          )}
          {erreur && <p className="field-erreur">{erreur}</p>}
        </div>
      )}
      <div className="po-panneau-bloc">
        <p className="po-kicker">Fichiers</p>
        <p className="po-aide">nommage {code}_ÉTAPE_LIVRABLE_vNN, une version par reprise</p>
        <p className="po-aide">Aucun fichier.</p>
      </div>
      <FilDiscussion slug={slug} projetId={projetId} tacheId={tache.id} moiId={moiId} mentionnables={mentionnables} onMaj={onMaj} />
      <div className="po-panneau-bloc">
        <p className="po-kicker">Historique</p>
        {!historique ? (
          <p className="po-aide">Chargement…</p>
        ) : historique.length === 0 ? (
          <p className="po-aide">Aucun événement.</p>
        ) : (
          <ul className="po-historique">
            {historique.map((e) => (
              <li key={e.id}>
                {jjmmaaaa(e.le)} · {e.detail}
                {e.par && ` par ${e.par}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function dureeStandard(t: TacheOuverte): string {
  if (t.heures !== null) return `${String(t.heures).replace('.', ',')} h · temps calculé, aucune saisie`;
  if (t.temps.type === 'partage') return t.temps.libelle;
  return 'Sans temps atelier';
}
