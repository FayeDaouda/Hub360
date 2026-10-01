'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getNotifications, libelleAlerteDerivee } from '@/lib/notifications';
import type { FluxNotifications } from '@/lib/types';
import { RadialGauge } from '@/components/admin/radial-gauge';

function ilYa(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  const j = Math.floor(s / 86_400);
  return j === 1 ? 'hier' : `il y a ${j} j`;
}

// Colonne de droite de l'accueil collaborateur : le flux d'activité (mêmes
// données que la cloche, lot 2) + une jauge d'avancement. Aucun nouvel appel
// côté page — le rail se charge lui-même.
export function RailAccueil({
  slug,
  pourcentage,
}: {
  slug: string;
  pourcentage: number | null;
}) {
  const [flux, setFlux] = useState<FluxNotifications | null>(null);

  useEffect(() => {
    getNotifications(slug).then(setFlux).catch(() => setFlux(null));
  }, [slug]);

  const elements = (flux?.elements ?? []).slice(0, 6);

  return (
    <aside className="rail-accueil">
      <div className="panel">
        <h3 className="panel-title">Activité récente</h3>
        {elements.length === 0 ? (
          <p className="notif-vide">Rien à signaler.</p>
        ) : (
          <ul className="notif-liste">
            {elements.map((n) => {
              const corps = (
                <>
                  <span
                    className="notif-point"
                    data-etat={n.derivee ? 'echeance' : n.lu ? 'lu' : 'nonlu'}
                    aria-hidden
                  />
                  <span className="notif-txt">
                    <span className="notif-titre">{n.titre}</span>
                    <span className="notif-meta">
                      {n.derivee ? libelleAlerteDerivee(n) : ilYa(n.date)}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={n.id}>
                  {n.projetId ? (
                    <Link
                      href={`/collab/${slug}/projets/${n.projetId}`}
                      className="notif-item"
                    >
                      {corps}
                    </Link>
                  ) : (
                    <span className="notif-item">{corps}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pourcentage != null && (
        <div className="panel rail-accueil-gauge">
          <RadialGauge
            data={{ pourcentage }}
            libelle="Avancement checklists"
            centre={`${pourcentage} %`}
            sousTexte="sur tes projets actifs"
            ton={pourcentage >= 100 ? 'sauge' : 'argile'}
          />
        </div>
      )}
    </aside>
  );
}
