import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BarreAgenda } from './barre-agenda';

// Barre de l'Agenda (18/11/2026).
const props = (x: Partial<Parameters<typeof BarreAgenda>[0]> = {}) => ({
  vue: 'semaine' as const,
  ancre: '2026-11-18',
  aujourdhui: '2026-11-18',
  etroit: false,
  peutCreer: true,
  colonneOuverte: false,
  miniOuvert: false,
  onVue: vi.fn(),
  onAujourdhui: vi.fn(),
  onDecaler: vi.fn(),
  onColonne: vi.fn(),
  onMini: vi.fn(),
  onCreer: vi.fn(),
  onAbonnement: vi.fn(),
  onConnectes: vi.fn(),
  ...x,
});

describe('BarreAgenda', () => {
  it('ordinateur : la période, les flèches, les vues (sans « 3 jours ») et Créer', async () => {
    const p = props();
    render(<BarreAgenda {...p} />);
    expect(screen.getByRole('heading', { name: '16 – 22 novembre 2026' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Semaine suivante' }));
    expect(p.onDecaler).toHaveBeenCalledWith(1);
    const vues = screen.getAllByRole('radio').map((r) => r.textContent);
    expect(vues).toEqual(['Jour', 'Semaine', 'Mois', 'Année', 'Planning']);
    expect(screen.getByRole('radio', { name: 'Semaine' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Mois' }));
    expect(p.onVue).toHaveBeenCalledWith('mois');
    await userEvent.click(screen.getByRole('button', { name: /Créer/ }));
    expect(p.onCreer).toHaveBeenCalled();
  });

  it('« ⋯ » : lien d’abonnement et agendas connectés', async () => {
    const p = props();
    render(<BarreAgenda {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’options' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Agendas connectés' }));
    expect(p.onConnectes).toHaveBeenCalled();
  });

  it('sans le droit de créer : pas de bouton Créer', () => {
    render(<BarreAgenda {...props({ peutCreer: false })} />);
    expect(screen.queryByRole('button', { name: /Créer/ })).not.toBeInTheDocument();
  });

  it('téléphone : ☰, le mois (ouvre le mini-calendrier), Aujourd’hui avec le jour, sans flèches', async () => {
    const p = props({ etroit: true, vue: '3jours' });
    render(<BarreAgenda {...p} />);
    expect(screen.queryByRole('button', { name: /suivant/ })).not.toBeInTheDocument();
    const mois = screen.getByRole('button', { name: /Novembre 2026/ });
    expect(mois).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(mois);
    expect(p.onMini).toHaveBeenCalled();
    const aujourdhui = screen.getByRole('button', { name: 'Aujourd’hui' });
    expect(aujourdhui).toHaveTextContent('18');
    await userEvent.click(aujourdhui);
    expect(p.onAujourdhui).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Vues et agendas' }));
    expect(p.onColonne).toHaveBeenCalled();
  });
});
