'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

// « ? » discret à côté d'un libellé : la règle du système qui l'explique,
// hors du corps de la page. Au survol ou au focus sur ordinateur, au toucher
// sur téléphone ; Échap ou un clic ailleurs referme.
export function Infobulle({ children, libelle = 'Explication' }: { children: ReactNode; libelle?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false);
    document.addEventListener('mousedown', surClic);
    document.addEventListener('keydown', surTouche);
    return () => {
      document.removeEventListener('mousedown', surClic);
      document.removeEventListener('keydown', surTouche);
    };
  }, [ouvert]);

  return (
    <span ref={racine} className="infobulle" onMouseEnter={() => setOuvert(true)} onMouseLeave={() => setOuvert(false)}>
      <button
        type="button"
        className="infobulle-bouton"
        aria-label={libelle}
        aria-expanded={ouvert}
        aria-describedby={ouvert ? id : undefined}
        onClick={() => setOuvert((o) => !o)}
        onFocus={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
      >
        ?
      </button>
      {ouvert && (
        <span id={id} role="tooltip" className="infobulle-texte">
          {children}
        </span>
      )}
    </span>
  );
}
