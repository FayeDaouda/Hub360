'use client';

import { KeyboardEvent, useRef } from 'react';
import { Moon, Sun, type LucideIcon } from 'lucide-react';
import { usePreferenceTheme, type PreferenceTheme } from '@/lib/theme';

// Les choix d'affichage (clair, sombre — « Système » retiré le 23/10/2026),
// partagés avec le popover ThemeToggle de l'admin, Mes réglages et la
// navigation mobile (une seule définition).
export const OPTIONS_THEME: { valeur: PreferenceTheme; libelle: string; Icone: LucideIcon }[] = [
  { valeur: 'light', libelle: 'Clair', Icone: Sun },
  { valeur: 'dark', libelle: 'Sombre', Icone: Moon },
];

// Contrôle segmenté clair / sombre (écran de connexion, maquette
// sept. 2026). Le curseur glissant est positionné en CSS depuis l'attribut
// data-theme-pref de <html> (posé avant l'hydratation) : il est déjà au bon
// endroit au premier paint, sans saut. Clavier : motif radiogroup ARIA —
// une seule option dans l'ordre de tabulation, flèches pour changer.
export function SelecteurTheme() {
  const { preference, choisir } = usePreferenceTheme();
  const boutons = useRef<(HTMLButtonElement | null)[]>([]);

  function surTouche(evenement: KeyboardEvent<HTMLDivElement>) {
    const actuel = OPTIONS_THEME.findIndex((o) => o.valeur === preference);
    const dernier = OPTIONS_THEME.length - 1;
    let cible: number;
    switch (evenement.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        cible = actuel === dernier ? 0 : actuel + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        cible = actuel === 0 ? dernier : actuel - 1;
        break;
      case 'Home':
        cible = 0;
        break;
      case 'End':
        cible = dernier;
        break;
      default:
        return;
    }
    evenement.preventDefault();
    choisir(OPTIONS_THEME[cible].valeur);
    boutons.current[cible]?.focus();
  }

  return (
    <div
      className="selecteur-theme"
      role="radiogroup"
      aria-label="Mode d’affichage"
      onKeyDown={surTouche}
    >
      <span className="selecteur-theme-curseur" aria-hidden />
      {OPTIONS_THEME.map(({ valeur, libelle, Icone }, index) => {
        const actif = preference === valeur;
        return (
          <button
            key={valeur}
            ref={(el) => {
              boutons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={actif}
            aria-label={libelle}
            title={libelle}
            tabIndex={actif ? 0 : -1}
            className="selecteur-theme-option"
            data-valeur={valeur}
            onClick={() => choisir(valeur)}
          >
            <Icone size={17} strokeWidth={1.9} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
