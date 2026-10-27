import type { ReactNode } from 'react';
import type { Tone } from './task-groups';

// Groupe de lignes (section de la vue par urgence, ou projet) : rien s'il
// est vide.
export function TaskGroup({
  title,
  tone,
  count,
  hideTitle = false,
  project = false,
  noCount = false,
  note,
  children,
}: {
  title: string;
  tone: Tone;
  count: number;
  hideTitle?: boolean;
  project?: boolean;
  noCount?: boolean;
  note?: string;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mt-groupe">
      {!hideTitle && (
        <h2 className={`mt-groupe-titre${project ? ' mt-groupe-titre--projet' : ''}`} data-ton={tone}>
          {title} {!noCount && <span className="mt-groupe-compte">{count}</span>}
          {note && <span className="mt-groupe-note">{note}</span>}
        </h2>
      )}
      <ul className="mt-lignes">{children}</ul>
    </div>
  );
}
