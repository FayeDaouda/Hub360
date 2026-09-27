'use client';

import { useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { definirThemePrefere, themePrefere, type Theme } from '@/lib/theme';

// Bascule clair/sombre du topbar admin — refonte dark/light, sept. 2026
// (maquette de référence, « Mode d'affichage » en popover plutôt qu'un
// simple switch inline — retour boss). Défaut serveur 'dark' (cf.
// THEME_PAR_DEFAUT dans lib/theme.ts) puis synchronisé sur la vraie
// préférence après montage — même motif SSR-safe que le son de notification.
// Structure du popover (ouverture/fermeture, clic dehors, Échap) calquée sur
// ClocheNotifications — un seul point de vérité pour ce pattern dans la topbar.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [ouvert, setOuvert] = useState(false);
  const boiteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme(themePrefere());
  }, []);

  useEffect(() => {
    if (!ouvert) return;
    function onDoc(e: MouseEvent) {
      if (boiteRef.current && !boiteRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOuvert(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [ouvert]);

  function choisir(suivant: Theme) {
    setTheme(suivant);
    definirThemePrefere(suivant);
  }

  const sombre = theme === 'dark';

  return (
    <div className="theme-toggle" ref={boiteRef}>
      <button
        type="button"
        className="admin-icon-btn"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label="Mode d’affichage"
        title="Mode d’affichage"
        onClick={() => setOuvert((o) => !o)}
      >
        {sombre ? <Moon size={16} strokeWidth={1.75} /> : <Sun size={16} strokeWidth={1.75} />}
      </button>

      {ouvert && (
        <div className="theme-menu" role="menu">
          <p className="theme-menu-titre">Mode d’affichage</p>
          <div className="theme-menu-segmente" role="radiogroup" aria-label="Mode d’affichage">
            <button
              type="button"
              className={`theme-menu-option${!sombre ? ' est-actif' : ''}`}
              role="radio"
              aria-checked={!sombre}
              onClick={() => choisir('light')}
            >
              <Sun size={17} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              className={`theme-menu-option${sombre ? ' est-actif' : ''}`}
              role="radio"
              aria-checked={sombre}
              onClick={() => choisir('dark')}
            >
              <Moon size={17} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <p className="theme-menu-etat">{sombre ? 'Mode sombre activé' : 'Mode clair activé'}</p>
          <p className="theme-menu-desc">
            {sombre
              ? 'Une expérience plus reposante pour vos yeux.'
              : 'Fond clair et lumineux, même signature verre dépoli.'}
          </p>
        </div>
      )}
    </div>
  );
}
