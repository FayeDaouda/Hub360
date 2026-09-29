'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ApiError } from '@/lib/client-api';
import { getMaCellule } from '@/lib/mon-espace';
import { NIVEAUX_COLLABORATEUR, PHASES, type MaCellule as DonneesCellule } from '@/lib/types';

// « Mon espace » · Ma cellule (RH lot 5d) : les membres de la cellule (chef
// repéré) et les projets en cours qu'elle suit.
export function MaCellule({ slug }: { slug: string }) {
  const base = usePathname().split('/mon-espace')[0];
  const [cellule, setCellule] = useState<DonneesCellule | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getMaCellule(slug)
      .then((r) => setCellule(r.cellule))
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger ta cellule.'));
  }, [slug]);

  if (erreur) return <p className="empty-state">{erreur}</p>;
  if (cellule === undefined) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }
  if (!cellule) return <p className="empty-state">Tu n’es rattaché(e) à aucune cellule.</p>;

  return (
    <div className="dmd-grille">
      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">
          {cellule.nom} · {cellule.membres.length} membre(s)
        </h2>
        <ul className="dmd-liste">
          {cellule.membres.map((m) => (
            <li key={m.id} className="dmd-ligne">
              <span>
                <strong>{m.nom}</strong>
                <span className="cell-sub">
                  {m.role} · {NIVEAUX_COLLABORATEUR[m.niveau]}
                </span>
              </span>
              <span className="dmd-actions">
                {m.estChef && <span className="pill pill--info">Chef de cellule</span>}
                {m.estMoi && <span className="pill pill--neutre">Toi</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Projets suivis · {cellule.projets.length}</h2>
        {cellule.projets.length === 0 ? (
          <p className="empty-state">Aucun projet en cours pour la cellule.</p>
        ) : (
          <ul className="dmd-liste">
            {cellule.projets.map((p) => (
              <li key={p.id} className="dmd-ligne">
                <span>
                  <Link className="lien-inline" href={`${base}/projets/${p.id}`}>
                    <strong>{p.code}</strong>
                  </Link>
                  <span className="cell-sub">{p.programme}</span>
                </span>
                <span className="pill pill--neutre">{PHASES[p.phase]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
