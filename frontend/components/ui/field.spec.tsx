import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field, FieldError } from './field';
import { EmptyState, Skeleton } from './feedback';

describe('Field', () => {
  it('libellé et contrôle dans un <label> : le libellé nomme le champ', () => {
    render(
      <Field label="Montant HT (FCFA)">
        <input className="field-input" />
      </Field>,
    );
    const champ = screen.getByRole('textbox', { name: 'Montant HT (FCFA)' });
    expect(champ.closest('label')).toHaveClass('field');
    expect(screen.getByText('Montant HT (FCFA)')).toHaveClass('field-label');
  });

  it('groupe en <div>, classes et style en plus', () => {
    const { container } = render(
      <Field label="Nature" as="div" className="np-nature" style={{ display: 'grid' }}>
        <input type="radio" />
      </Field>,
    );
    const groupe = container.firstChild as HTMLElement;
    expect(groupe.tagName).toBe('DIV');
    expect(groupe.className).toBe('field np-nature');
    expect(groupe).toHaveStyle({ display: 'grid' });
  });

  it('erreur : paragraphe .field-erreur', () => {
    render(<FieldError>Le nom est requis.</FieldError>);
    expect(screen.getByText('Le nom est requis.')).toHaveClass('field-erreur');
  });
});

describe('Skeleton et EmptyState', () => {
  it('squelette décoratif, taille et classe au choix', () => {
    const { container } = render(
      <>
        <Skeleton />
        <Skeleton size="sm" />
        <Skeleton className="cal-cellule-squelette" />
      </>,
    );
    const [a, b, c] = [...container.children] as HTMLElement[];
    expect(a.className).toBe('skeleton admin-skeleton-panel');
    expect(b.className).toBe('skeleton admin-skeleton-panel admin-skeleton-panel--sm');
    expect(c.className).toBe('skeleton cal-cellule-squelette');
    for (const s of [a, b, c]) expect(s).toHaveAttribute('aria-hidden');
  });

  it('état vide', () => {
    render(<EmptyState>Aucun dossier.</EmptyState>);
    expect(screen.getByText('Aucun dossier.')).toHaveClass('empty-state');
  });
});
