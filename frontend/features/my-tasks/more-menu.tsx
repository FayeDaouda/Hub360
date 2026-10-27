'use client';

import { useEffect, useRef, useState } from 'react';
import { Ellipsis } from 'lucide-react';

// Téléphone : un seul bouton visible par carte (« Déposer ») ; les actions
// secondaires passent dans ce menu « ⋯ » (masqué sur ordinateur, où elles
// apparaissent au survol de la ligne).
export function MoreMenu({ actions }: { actions: { label: string; run: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <span className="mt-plus" ref={box}>
      <button
        type="button"
        className="btn-ghost btn-ghost--sm mt-plus-bouton"
        aria-label="Autres actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis size={16} aria-hidden />
      </button>
      {open && (
        <span className="mt-plus-menu" role="menu">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                a.run();
              }}
            >
              {a.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
