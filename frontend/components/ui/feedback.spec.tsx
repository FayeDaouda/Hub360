import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState } from './feedback';

describe('ErrorState', () => {
  it('annonce le message aux lecteurs d’écran (role="alert")', () => {
    render(<ErrorState>Journal indisponible.</ErrorState>);
    expect(screen.getByRole('alert')).toHaveTextContent('Journal indisponible.');
  });

  it('propose « Réessayer » et relance au clic quand onRetry est fourni', async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry}>Réseau coupé.</ErrorState>);
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('n’affiche aucun bouton sans onRetry', () => {
    render(<ErrorState>Réseau coupé.</ErrorState>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
