'use client';

import { useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { usePreferenceTheme, type PreferenceTheme } from '@/lib/theme';
import { OPTIONS_THEME } from '@/components/selecteur-theme';

const ETAT: Record<PreferenceTheme, { titre: string; description: string }> = {
  dark: {
    titre: 'Mode sombre activé',
    description: 'Une expérience plus reposante pour vos yeux.',
  },
  light: {
    titre: 'Mode clair activé',
    description: 'Fond clair et lumineux, même signature verre dépoli.',
  },
};

// Bascule clair/sombre du topbar admin — refonte dark/light, sept. 2026
// (maquette de référence, « Mode d'affichage » en popover plutôt qu'un
// simple switch inline — retour boss). État lu dans le magasin partagé de
// lib/theme.ts (défaut serveur 'dark', vraie préférence après hydratation).
// Structure du popover (ouverture/fermeture, clic dehors, Échap) calquée sur
// ClocheNotifications — un seul point de vérité pour ce pattern dans la topbar.
export function ThemeToggle() {
  const { preference, theme, choisir } = usePreferenceTheme();
  const [ouvert, setOuvert] = useState(false);
  const boiteRef = useRef<HTMLDivElement>(null);

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
            {OPTIONS_THEME.map(({ valeur, libelle, Icone }) => (
              <button
                key={valeur}
                type="button"
                className={`theme-menu-option${preference === valeur ? ' est-actif' : ''}`}
                role="radio"
                aria-checked={preference === valeur}
                aria-label={libelle}
                title={libelle}
                onClick={() => choisir(valeur)}
              >
                <Icone size={17} strokeWidth={2} aria-hidden />
              </button>
            ))}
          </div>
          <p className="theme-menu-etat">{ETAT[preference].titre}</p>
          <p className="theme-menu-desc">{ETAT[preference].description}</p>
        </div>
      )}
    </div>
  );
}
