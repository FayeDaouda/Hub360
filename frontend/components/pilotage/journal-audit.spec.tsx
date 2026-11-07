import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getJournalAudit, type JournalAudit as Journal } from '@/lib/pilotage';
import { JournalAudit } from './journal-audit';

vi.mock('@/lib/pilotage', () => ({ getJournalAudit: vi.fn() }));
const charger = vi.mocked(getJournalAudit);

const JOURNAL: Journal = {
  debut: '2026-01-01',
  fin: '2026-11-07',
  lignes: [
    {
      id: 'L1',
      le: '2026-11-06T10:00:00.000Z',
      categorie: 'droits',
      action: 'Matrice modifiée',
      detail: 'CFO › Finances',
      par: 'Awa Sarr',
    },
  ],
};

beforeEach(() => {
  charger.mockReset();
});

describe('JournalAudit', () => {
  it('par défaut (Pilotage), porte son propre titre « Journal d’audit »', async () => {
    charger.mockResolvedValue(JOURNAL);
    render(<JournalAudit slug="grey-concrete" />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Journal d’audit' })).toBeInTheDocument();
    expect(charger).toHaveBeenCalledWith('grey-concrete', undefined, undefined);
  });

  it('sans en-tête (Administration du HUB), pas de h2 mais une section nommée « Journal d’audit »', async () => {
    charger.mockResolvedValue(JOURNAL);
    render(<JournalAudit slug="grey-concrete" entete={false} />);
    expect(await screen.findByRole('region', { name: 'Journal d’audit' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByText('Matrice modifiée')).toBeInTheDocument();
  });

  it('avec en-tête, la section n’a pas d’aria-label redondant avec le titre', async () => {
    charger.mockResolvedValue(JOURNAL);
    const { container } = render(<JournalAudit slug="grey-concrete" />);
    await screen.findByText('Matrice modifiée');
    expect(container.querySelector('section')).not.toHaveAttribute('aria-label');
  });

  it('en cas d’échec du chargement initial, affiche l’erreur et « Réessayer » relance le chargement', async () => {
    charger.mockRejectedValueOnce(new Error('Serveur injoignable.')).mockResolvedValueOnce(JOURNAL);
    render(<JournalAudit slug="grey-concrete" entete={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Serveur injoignable.');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Matrice modifiée')).toBeInTheDocument();
    expect(charger).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('erreur sans message : repli sur « Journal indisponible. »', async () => {
    charger.mockRejectedValue(new Error(''));
    render(<JournalAudit slug="grey-concrete" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Journal indisponible.');
  });
});
