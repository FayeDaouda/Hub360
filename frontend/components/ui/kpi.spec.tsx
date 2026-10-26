import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KpiFunnel, KpiMiniBars, KpiStrip } from './kpi';

const tile = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll<HTMLElement>('.kpi-tuile')].find((t) => t.textContent?.includes(label))!;

describe('KpiStrip', () => {
  it('une seule tuile en alerte : la première « risque »', () => {
    const { container } = render(
      <KpiStrip
        tiles={[
          { id: 'a', label: 'Calme', value: 1 },
          { id: 'b', label: 'Retards', value: 2, state: 'risque' },
          { id: 'c', label: 'Échues', value: 3, state: 'risque' },
        ]}
      />,
    );
    expect(tile(container, 'Calme').className).toBe('kpi-tuile kpi-tuile--marque');
    expect(tile(container, 'Retards').className).toBe('kpi-tuile kpi-tuile--risque kpi-tuile--alerte');
    expect(tile(container, 'Échues').className).toBe('kpi-tuile kpi-tuile--risque');
  });

  it('montant : arrondi au-delà d’un million, montant exact en tête du sous-texte', () => {
    render(
      <KpiStrip
        tiles={[
          { id: 'g', label: 'Facturé', amount: 31_020_000, hint: 'année en cours' },
          { id: 'p', label: 'Encaissé', amount: 750_000 },
        ]}
      />,
    );
    expect(screen.getByText('31,02 M FCFA')).toBeInTheDocument();
    expect(screen.getByText('31 020 000 FCFA · année en cours')).toBeInTheDocument();
    expect(screen.getByText('750 000 FCFA')).toBeInTheDocument();
  });

  it('actions : fenêtre, lien, filtre (aria-pressed)', async () => {
    const onDialog = vi.fn();
    const onFilter = vi.fn();
    render(
      <KpiStrip
        tiles={[
          { id: 'd', label: 'À valider', value: 2, action: { type: 'dialog', onClick: onDialog } },
          { id: 'l', label: 'Mentions', value: 1, action: { type: 'link', href: '/mes-taches' } },
          { id: 'f', label: 'Incomplets', value: 4, action: { type: 'filter', active: true, onClick: onFilter } },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /À valider/ }));
    expect(onDialog).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /À valider/ })).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.getByRole('link', { name: /Mentions/ })).toHaveAttribute('href', '/mes-taches');
    const filtre = screen.getByRole('button', { name: /Incomplets/ });
    expect(filtre).toHaveAttribute('aria-pressed', 'true');
    expect(filtre.className).toContain('kpi-tuile--actif');
  });

  it('tendance : pastille avec le delta et sa description', () => {
    render(
      <KpiStrip
        tiles={[
          { id: 't', label: 'Leads', value: 12, trend: { direction: 'hausse', short: '+3', text: '+3 sur le mois' } },
        ]}
      />,
    );
    expect(screen.getByTitle('+3 sur le mois')).toHaveClass('kpi-tuile-badge', 'kpi-tuile-badge--hausse');
  });
});

describe('KpiFunnel et KpiMiniBars', () => {
  it('segments : classe de statut et légende', () => {
    const { container } = render(
      <KpiFunnel
        segments={[
          { id: 'nouveau_projet', label: 'Nouveaux', value: 3 },
          { id: 'signe', label: 'Signés', value: 1 },
        ]}
        natureSplit={{ mandate: 2, promotion: 2 }}
      />,
    );
    expect(container.querySelector('.kpi-funnel-seg--nouveau_projet')).toHaveStyle({ width: '75%' });
    expect(screen.getByText(/Mandat/)).toHaveTextContent('Mandat 2 · Promotion 2');
  });

  it('mini-barres : liste vide annoncée', () => {
    render(<KpiMiniBars items={[]} />);
    expect(screen.getByText('Aucune cellule assignée.')).toBeInTheDocument();
  });
});
