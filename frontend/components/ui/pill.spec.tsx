import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pill } from './pill';

describe('Pill', () => {
  it('rend les classes d’avant : pill, sa teinte, les classes en plus', () => {
    render(
      <Pill tone="info" className="fc-chef" title="Chef de team">
        Chef
      </Pill>,
    );
    const pill = screen.getByText('Chef');
    expect(pill.tagName).toBe('SPAN');
    expect(pill.className).toBe('pill pill--info fc-chef');
    expect(pill).toHaveAttribute('title', 'Chef de team');
  });

  it('accepte une classe complète venue d’une table de statuts', () => {
    render(<Pill className="pill--attention">À traiter</Pill>);
    expect(screen.getByText('À traiter').className).toBe('pill pill--attention');
  });

  it('sans teinte ni classe : la pastille neutre par défaut du CSS', () => {
    render(<Pill>Brouillon</Pill>);
    const pill = screen.getByText('Brouillon');
    expect(pill.className).toBe('pill');
    expect(pill).not.toHaveAttribute('title');
    expect(pill).not.toHaveAttribute('style');
  });
});
