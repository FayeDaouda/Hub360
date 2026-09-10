'use client';

import { CSSProperties, MouseEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Societe } from '@/lib/types';
import { SocieteAvatar } from './societe-avatar';

// Doit matcher la transition `opacity`/`transform` de .societe-card en CSS —
// on laisse l'animation de sortie jouer avant de naviguer réellement.
const EXIT_DURATION_MS = 200;

// Repli neutre pour une société sans couleur_marque définie en base.
const FALLBACK_COLOR = '#a5a398';

export function SocieteGrid({ societes }: { societes: Societe[] }) {
  const router = useRouter();
  const [leavingSlug, setLeavingSlug] = useState<string | null>(null);

  function handleClick(event: MouseEvent<HTMLAnchorElement>, slug: string) {
    event.preventDefault();
    if (leavingSlug) return;
    setLeavingSlug(slug);
    setTimeout(() => router.push(`/login/${slug}`), EXIT_DURATION_MS);
  }

  return (
    <div className={`societe-grid${leavingSlug ? ' is-navigating' : ''}`}>
      {societes.map((societe, index) => {
        const style: CSSProperties & Record<'--societe-color', string> = {
          animationDelay: `${index * 0.06}s`,
          '--societe-color': societe.couleurMarque || FALLBACK_COLOR,
        };

        return (
          <a
            key={societe.id}
            href={`/login/${societe.slug}`}
            className={`societe-card${leavingSlug === societe.slug ? ' is-leaving' : ''}`}
            style={style}
            onClick={(event) => handleClick(event, societe.slug)}
          >
            <SocieteAvatar societe={societe} theme="glass" size="xl" />
            <div className="societe-card-body">
              <h2>{societe.nom}</h2>
              {societe.secteur && <p className="societe-secteur">{societe.secteur}</p>}
            </div>
          </a>
        );
      })}
    </div>
  );
}
