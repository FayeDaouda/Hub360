'use client';

import { jjmmaaaa, numeroEtape, pastilleTache, type CarteOuverte, type TacheOuverte } from '@/lib/projets-ouverts';

type Props = { code: string; carte: CarteOuverte; tache: TacheOuverte };

// Panneau d'une tâche (maquette « Projets ») : qui, qui valide, durée,
// fenêtre et échéance figées, écart, descriptif et nommage des fichiers.
// Remise, validation, assignation et fil de discussion : lots suivants.
export function TachePanneau({ code, carte, tache }: Props) {
  const pastille = pastilleTache(tache.etat);
  const ecart = tache.etat.code === 'validee' ? tache.etat.ecart : null;
  const v = tache.validation;
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
      <div className="po-panneau-bloc">
        <p className="po-kicker">Fichiers</p>
        <p className="po-aide">nommage {code}_ÉTAPE_LIVRABLE_vNN, une version par reprise</p>
        <p className="po-aide">Aucun fichier.</p>
      </div>
    </aside>
  );
}

function dureeStandard(t: TacheOuverte): string {
  if (t.heures !== null) return `${String(t.heures).replace('.', ',')} h · temps calculé, aucune saisie`;
  if (t.temps.type === 'partage') return t.temps.libelle;
  return 'Sans temps atelier';
}
