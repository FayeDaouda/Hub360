import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export type ActionRapide = {
  cle: string;
  icone: LucideIcon;
  label: string;
  href: string;
};

// Rangée de raccourcis sous le titre d'un accueil — le prochain geste le plus
// courant, mis en avant. Style maison (Encre/Sable), pas de chrome flottant.
export function ActionsRapides({ actions }: { actions: ActionRapide[] }) {
  if (actions.length === 0) return null;
  return (
    <nav className="actions-rapides" aria-label="Raccourcis">
      {actions.map((a) => {
        const Icone = a.icone;
        return (
          <Link key={a.cle} href={a.href} className="actions-rapides-item">
            <span className="actions-rapides-icone" aria-hidden>
              <Icone size={17} strokeWidth={1.75} />
            </span>
            <span>{a.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
