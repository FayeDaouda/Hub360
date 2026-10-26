import type { CSSProperties, ReactNode } from 'react';

// Pastille de statut (« couleur = sens », 04-coque-admin.css). `tone` choisit la
// variante (pill--<tone>) ; `className` ajoute des classes — dont les classes
// complètes que des tables de statuts portent déjà (« pill--attention »).
export type PillTone =
  | 'succes'
  | 'info'
  | 'attention'
  | 'risque'
  | 'neutre'
  | 'aucun'
  | 'azur'
  | 'lecture'
  | 'ecriture'
  | 'validation'
  | 'phase'
  | 'sur-couleur'
  | `cat-${string}`
  | `nature-${string}`;

export function Pill({
  tone,
  className,
  title,
  style,
  children,
}: {
  tone?: PillTone;
  className?: string;
  title?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <span
      className={['pill', tone && `pill--${tone}`, className].filter(Boolean).join(' ')}
      title={title}
      style={style}
    >
      {children}
    </span>
  );
}
