'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAbsencesAValider, jjmm, LIBELLE_TYPE_ABSENCE } from '@/lib/demandes';
import type { DemandeAbsence } from '@/lib/types';
import { DecisionN1Modal } from './decision-n1-modal';

// File des absences dont la personne connectée est le N+1 (chef de cellule
// côté collab, Dir. GC côté back-office). Rien à afficher = rien rendu.
// `onCompte` : nombre en attente, pour un compteur d'onglet (Mon espace).
export function AbsencesADecider({ slug, onCompte }: { slug: string; onCompte?: (n: number) => void }) {
  const [liste, setListe] = useState<DemandeAbsence[]>([]);
  const [ouverte, setOuverte] = useState<string | null>(null);

  const charger = useCallback(() => {
    getAbsencesAValider(slug)
      .then(setListe)
      .catch(() => setListe([]));
  }, [slug]);
  useEffect(charger, [charger]);
  useEffect(() => onCompte?.(liste.length), [liste, onCompte]);

  if (liste.length === 0) return null;
  return (
    <section className="panel glass-panel dmd-section dmd-a-decider">
      <h2 className="dmd-titre">Absences à décider · {liste.length}</h2>
      <ul className="dmd-liste">
        {liste.map((d) => (
          <li key={d.id} className="dmd-ligne">
            <span>
              <strong>{d.salarie ? `${d.salarie.prenom} ${d.salarie.nom}` : '—'}</strong>
              <span className="cell-sub">
                {LIBELLE_TYPE_ABSENCE[d.type]} · {d.jours} j · {jjmm(d.dateDebut)} → {jjmm(d.dateFin)}
              </span>
            </span>
            <button type="button" className="btn-primary btn-primary--sm" onClick={() => setOuverte(d.id)}>
              Décider
            </button>
          </li>
        ))}
      </ul>
      {ouverte && (
        <DecisionN1Modal
          slug={slug}
          id={ouverte}
          onClose={() => setOuverte(null)}
          onFait={() => {
            setOuverte(null);
            charger();
          }}
        />
      )}
    </section>
  );
}
