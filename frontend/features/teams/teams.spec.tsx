import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { teamsViewFixture } from './fixtures';
import { Teams } from './teams';

const api = vi.hoisted(() => ({ getTeamsView: vi.fn() }));
vi.mock('./api', () => ({
  getTeamsView: api.getTeamsView,
  deleteCell: vi.fn(),
  renameCell: vi.fn(),
  setCellPilot: vi.fn(),
  updateEmployee: vi.fn(),
  createCell: vi.fn(),
}));
vi.mock('@/lib/demandes', () => ({ getAbsencesAValider: () => Promise.resolve([]) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/media', () => ({ useMediaQuery: () => false }));
vi.mock('@/lib/entete-fixe', () => ({ useEnteteFixe: () => undefined }));
vi.mock('@/lib/defilement', () => ({ useSectionEnLecture: () => undefined, allerA: () => undefined }));
vi.mock('@/components/pilotage/decisions-fiche', () => ({ DecisionsFiche: () => null }));

describe('Teams', () => {
  // Corps entre accolades : une fonction renvoyée par beforeEach est rappelée
  // par Vitest après le test, comme nettoyage. `mockReset()` renvoie la
  // fonction simulée : elle était rappelée après chaque test, et son rejet,
  // que personne n'attrapait, faisait échouer le test d'erreur.
  beforeEach(() => {
    api.getTeamsView.mockReset();
  });

  it('chargement, puis les cellules', async () => {
    api.getTeamsView.mockResolvedValue(teamsViewFixture());
    const { container } = render(<Teams slug="gc" canWrite />);
    expect(container.querySelector('.skeleton, [aria-hidden="true"]')).not.toBeNull();
    expect(await screen.findByRole('heading', { name: /GC-ARC-01/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Créer une cellule' })).toBeInTheDocument();
  });

  it('erreur de chargement : le message du serveur', async () => {
    api.getTeamsView.mockRejectedValue(new Error('Équipes indisponibles pour le moment.'));
    render(<Teams slug="gc" canWrite />);
    expect(await screen.findByText('Équipes indisponibles pour le moment.')).toBeInTheDocument();
  });

  it('listes vides : projets signés et tâches en cours', async () => {
    api.getTeamsView.mockResolvedValue(teamsViewFixture());
    render(<Teams slug="gc" canWrite />);
    await userEvent.click(await screen.findByRole('tab', { name: /Projets signés/ }));
    expect(screen.getByText('Aucun projet signé pour l’instant.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Tâches en cours/ }));
    expect(screen.getByText('Aucune tâche en cours.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Salariés à affecter/ }));
    expect(screen.getByText('Tous les salariés ont une cellule.')).toBeInTheDocument();
  });

  it('lecture seule : ni création ni actions sur les cellules', async () => {
    api.getTeamsView.mockResolvedValue(teamsViewFixture());
    render(<Teams slug="gc" canWrite={false} />);
    await screen.findByRole('heading', { name: /GC-ARC-01/ });
    expect(screen.queryByRole('heading', { name: 'Créer une cellule' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Renommer' })).toBeNull();
  });
});
