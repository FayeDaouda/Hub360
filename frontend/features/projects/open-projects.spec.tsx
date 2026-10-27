import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/client-api';
import { boardFixture, fileFixture } from './fixtures';
import { OpenProjects } from './open-projects';

const api = vi.hoisted(() => ({
  getBoard: vi.fn(),
  getProjectFile: vi.fn(),
  getAssignableEmployees: vi.fn(),
  getMentionablePeople: vi.fn(),
  getMyMentions: vi.fn(),
}));
vi.mock('./api', () => api);
vi.mock('@/features/my-tasks/api', () => ({ getMyTasks: vi.fn() }));
// Panneaux et décisions : leurs propres tests.
vi.mock('@/components/projets-ouverts/tache-panneau', () => ({ TachePanneau: () => <p>Panneau de la tâche</p> }));
vi.mock('@/components/projets-ouverts/carte-panneau', () => ({ CartePanneau: () => null }));
vi.mock('@/components/pilotage/decisions-fiche', () => ({ DecisionsFiche: () => null }));
const session = vi.hoisted(() => ({
  role: 'CEO (transverse)',
  utilisateur: { id: 'u1', email: 'a@b.c', nom: 'Diop', prenom: 'Awa' },
  permissions: { projets: 'lecture' },
}));
vi.mock('@/lib/layout-contexte', () => ({ useTitrePage: () => undefined, useSessionCourante: () => session }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

describe('OpenProjects', () => {
  beforeEach(() => {
    api.getBoard.mockReset();
    api.getProjectFile.mockReset();
    api.getMentionablePeople.mockResolvedValue([]);
  });

  it('chargement, puis le projet et son dossier ouvert sur l’étape par défaut', async () => {
    api.getBoard.mockResolvedValue(boardFixture());
    api.getProjectFile.mockResolvedValue(fileFixture());
    const { container } = render(<OpenProjects slug="gc" />);
    expect(container.querySelector('.skeleton, .admin-skeleton, [aria-busy]')).not.toBeNull();
    // Tableau puis dossier : deux chargements enchaînés, plus lents qu'un seul.
    expect(await screen.findByRole('heading', { name: /FS_POI\.26/ }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Onboard/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('F2 attend 02, 03')).toBeInTheDocument();
    expect(api.getProjectFile).toHaveBeenCalledWith('gc', 'p1');
  });

  it('une tâche ouvre son panneau ; changer d’étape le ferme', async () => {
    api.getBoard.mockResolvedValue(boardFixture());
    api.getProjectFile.mockResolvedValue(fileFixture());
    render(<OpenProjects slug="gc" />);
    await userEvent.click(await screen.findByRole('button', { name: /Plan masse/ }, { timeout: 3000 }));
    expect(screen.getByText('Panneau de la tâche')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Esquisse/ }));
    expect(screen.queryByText('Panneau de la tâche')).not.toBeInTheDocument();
  });

  it('aucun projet ouvert : le message explique quand un projet s’ouvre', async () => {
    api.getBoard.mockResolvedValue(boardFixture({ projets: [] }));
    render(<OpenProjects slug="gc" />);
    expect(await screen.findByRole('heading', { name: 'Aucun projet ouvert' })).toBeInTheDocument();
    expect(api.getProjectFile).not.toHaveBeenCalled();
  });

  it('erreur de lecture : le message du serveur', async () => {
    api.getBoard.mockRejectedValue(new ApiError('Projets indisponibles pour le moment.', 503));
    render(<OpenProjects slug="gc" />);
    expect(await screen.findByText('Projets indisponibles pour le moment.')).toBeInTheDocument();
  });
});
