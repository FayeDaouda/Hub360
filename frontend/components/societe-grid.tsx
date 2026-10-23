'use client';

import { CSSProperties, MouseEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { colonnesPortail } from '@/lib/portail';
import { SocietePortail } from '@/lib/types';
import { SocieteAvatar } from './societe-avatar';

// Doit matcher la transition de sortie de .societe-carte en CSS — on laisse
// l'animation jouer avant de naviguer réellement.
const EXIT_DURATION_MS = 220;

// Repli neutre pour une société sans couleur_marque définie en base.
const FALLBACK_COLOR = '#a5a398';

type StyleCarte = CSSProperties & Record<'--societe-color' | '--i', string>;

// Cartes vitrées du portail (maquette liquid glass, sept. 2026). La couleur
// de marque (couleurMarque) ne sert que d'accent — halo derrière le logo,
// bordure et lueur au survol —, jamais de fond plein : l'ensemble reste
// cohérent quelle que soit la palette de chaque société. Une société pas
// encore ouverte (accesOuvert = false) est annoncée « Bientôt » : même carte,
// sans lien ni survol.
export function SocieteGrid({ societes }: { societes: SocietePortail[] }) {
  const router = useRouter();
  const [leavingSlug, setLeavingSlug] = useState<string | null>(null);

  // Précharge les écrans de connexion (une poignée de sociétés) : une fois l'animation
  // de sortie jouée, la navigation est instantanée (prod — sans effet en dev).
  useEffect(() => {
    societes
      .filter((societe) => societe.accesOuvert)
      .forEach((societe) => router.prefetch(`/login/${societe.slug}`));
  }, [router, societes]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>, slug: string) {
    // Ctrl/Cmd/Maj/clic molette : ouverture dans un nouvel onglet, comme un
    // lien normal — pas d'animation de sortie sur la page courante.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (leavingSlug) return;
    setLeavingSlug(slug);
    setTimeout(() => router.push(`/login/${slug}`), EXIT_DURATION_MS);
  }

  return (
    <ul
      className={`portail-societes${leavingSlug ? ' is-navigating' : ''}`}
      style={{ '--colonnes': colonnesPortail(societes.length) } as CSSProperties}
    >
      {societes.map((societe, index) => {
        const style: StyleCarte = {
          '--i': String(index),
          '--societe-color': societe.couleurMarque || FALLBACK_COLOR,
        };

        const identite = (
          <>
            <span className="societe-carte-logo">
              {/* alt vide : le nom est juste à côté, sinon le lien serait
                  annoncé « Grey Concrete Grey Concrete ». */}
              <SocieteAvatar societe={societe} theme="glass" alt="" />
            </span>
            <span className="societe-carte-corps">
              <h2 className="societe-carte-nom">{societe.nom}</h2>
              {societe.secteur && <span className="societe-carte-secteur">{societe.secteur}</span>}
            </span>
          </>
        );

        if (!societe.accesOuvert) {
          return (
            <li key={societe.id}>
              <div className="societe-carte societe-carte--bientot" style={style}>
                {identite}
                <span className="societe-carte-bientot">Bientôt</span>
              </div>
            </li>
          );
        }

        return (
          <li key={societe.id}>
            <a
              href={`/login/${societe.slug}`}
              className={`societe-carte${leavingSlug === societe.slug ? ' is-leaving' : ''}`}
              style={style}
              onClick={(event) => handleClick(event, societe.slug)}
            >
              {identite}
              <span className="societe-carte-fleche" aria-hidden>
                <ArrowRight size={18} strokeWidth={2} />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
