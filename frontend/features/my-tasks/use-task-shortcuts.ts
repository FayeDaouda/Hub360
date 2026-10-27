'use client';

import { useEffect } from 'react';

// Clavier (ordinateur) : J / K passe d'une tâche à l'autre, Entrée l'ouvre
// (bouton du titre), D la dépose. Rien quand on écrit ou qu'une fenêtre
// (dépôt, panneau de tâche) est ouverte.
export function useTaskShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'j' && key !== 'k' && key !== 'd') return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.modal-backdrop, .fiche-crm-fond')) return;
      const titles = [...document.querySelectorAll<HTMLButtonElement>('.mt-liste [data-tache] .mt-titre-bouton')];
      if (!titles.length) return;
      const i = titles.findIndex((b) => b.closest('[data-tache]')?.contains(document.activeElement));
      if (key === 'd') {
        if (i < 0) return;
        titles[i].closest('[data-tache]')?.querySelector<HTMLButtonElement>('[data-action="deposer"]')?.click();
      } else {
        const next = i < 0 ? 0 : key === 'j' ? Math.min(i + 1, titles.length - 1) : Math.max(i - 1, 0);
        titles[next].focus();
        titles[next].scrollIntoView({ block: 'nearest' });
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
