import type { CSSProperties, ReactNode } from 'react';

// Champ de formulaire : libellé au-dessus, contrôle(s) en dessous
// (.field, .field-label). `as="div"` pour un groupe sans contrôle unique
// (boutons radio, cases) : un <label> n'en engloberait qu'un.
export function Field({
  label,
  children,
  as: Element = 'label',
  htmlFor,
  className,
  style,
}: {
  label: ReactNode;
  children?: ReactNode;
  as?: 'label' | 'div';
  htmlFor?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Element className={className ? `field ${className}` : 'field'} htmlFor={htmlFor} style={style}>
      <span className="field-label">{label}</span>
      {children}
    </Element>
  );
}

/** Message d'erreur d'un champ ou d'un formulaire (.field-erreur). */
export function FieldError({ children }: { children: ReactNode }) {
  return <p className="field-erreur">{children}</p>;
}
