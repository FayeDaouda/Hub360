'use client';

import { useEffect, useState } from 'react';

// Fichier glissé au-dessus de la fenêtre : les tâches s'allument (compteur :
// dragenter/dragleave se déclenchent à chaque élément traversé). Lâché hors
// d'une tâche, il n'est pas ouvert par le navigateur.
export function useFileDrag(): boolean {
  const [inFlight, setInFlight] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setInFlight(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setInFlight(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const end = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
      depth = 0;
      setInFlight(false);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', end);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', end);
    };
  }, []);
  return inFlight;
}
