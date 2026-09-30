'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { getJournalReglages, type LigneJournal } from '@/lib/reglages';

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Réglages · Journal (ISO 9001 §7.5.3) : chaque enregistrement, son motif,
// son auteur et les valeurs modifiées. Jamais modifié ni supprimé.
export function JournalPanel({ slug, versionInitiale }: { slug: string; versionInitiale: string }) {
  const [lignes, setLignes] = useState<LigneJournal[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getJournalReglages(slug)
      .then(setLignes)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger le journal.'));
  }, [slug]);

  // Un enregistrement = un lot (même motif, même instant).
  const lots = (lignes ?? []).reduce<LigneJournal[][]>((acc, l) => {
    const dernier = acc[acc.length - 1];
    if (dernier && dernier[0].lot === l.lot) dernier.push(l);
    else acc.push([l]);
    return acc;
  }, []);

  return (
    <section className="panel glass-panel dmd-section reg-panel">
      <h2 className="dmd-titre">Journal des réglages</h2>
      <p className="dmd-note">
        Historique complet des réglages (ISO 9001 §7.5.3). Chaque ligne figure aussi au registre des décisions, dans
        Pilotage.
      </p>
      {erreur ? (
        <p className="field-erreur">{erreur}</p>
      ) : !lignes ? (
        <div className="skeleton admin-skeleton-panel" aria-hidden />
      ) : lots.length === 0 ? (
        <p className="dmd-note">Aucune modification depuis la mise en service : le HUB applique les valeurs par défaut du gabarit {versionInitiale}.</p>
      ) : (
        <ul className="dmd-liste">
          {lots.map((lot) => (
            <li key={lot[0].lot} className="reg-lot">
              <span className="cell-sub">
                {dateHeure(lot[0].createdAt)}
                {lot[0].par && ` · ${lot[0].par}`}
              </span>
              <strong>« {lot[0].motif} »</strong>
              <ul className="reg-lot-lignes">
                {lot.map((l) => (
                  <li key={l.id}>{l.libelle}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
