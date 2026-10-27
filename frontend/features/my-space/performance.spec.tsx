import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { myTaskFixture as tache, myTasksViewFixture } from '@/features/my-tasks/fixtures';
import { MyPerformance } from './performance';

const api = vi.hoisted(() => ({ getMyTasks: vi.fn() }));
const access = vi.hoisted(() => ({ myTasks: true }));
vi.mock('@/features/my-tasks/api', () => api);
vi.mock('@/lib/temps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/temps')>()),
  getMonTemps: () => Promise.reject(new Error('sans feuille')),
}));
vi.mock('@/lib/acces-back-office', () => ({ sectionAccessible: () => access.myTasks }));
vi.mock('@/lib/layout-contexte', () => ({ useSessionCourante: () => ({}) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/gc/mon-espace' }));

const validated = (id: string, aTemps: boolean | null, version = 1) =>
  tache({ id, libelle: `Tâche ${id}`, statut: 'validee', valideLe: '2026-10-20T10:00:00.000Z', aTemps, version });

describe('MyPerformance', () => {
  beforeEach(() => {
    api.getMyTasks.mockReset();
    access.myTasks = true;
  });

  it('indicateurs et historique tels que jugés par le back', async () => {
    const view = myTasksViewFixture([validated('a', true), validated('b', false, 3), validated('c', null)]);
    view.stats = {
      ...view.stats,
      validees: 3,
      respectDelais: { aTemps: 1, total: 2, pct: 50 },
      reprises: { avecReprise: 1, total: 3, pct: 33 },
    };
    api.getMyTasks.mockResolvedValue(view);
    render(<MyPerformance slug="gc" />);
    expect(await screen.findByText('50 %')).toBeInTheDocument();
    expect(screen.getByText('33 %')).toBeInTheDocument();
    expect(screen.getByText('1 tâche renvoyée au moins une fois sur 3')).toBeInTheDocument();
    expect(screen.getByText('à temps')).toBeInTheDocument();
    expect(screen.getByText('remise après l’échéance')).toBeInTheDocument();
    expect(screen.getByText('sans remise datée')).toBeInTheDocument();
    expect(screen.getByText('2 reprises')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mes tâches' })).toHaveAttribute('href', '/admin/gc/mes-taches');
  });

  it('sans la page « Mes tâches » : la liste des tâches assignées, filtrable', async () => {
    access.myTasks = false;
    api.getMyTasks.mockResolvedValue(
      myTasksViewFixture([tache({ id: 'a', libelle: 'Coupe AA' }), validated('b', true)]),
    );
    render(<MyPerformance slug="gc" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Validées · 1' }));
    expect(screen.queryByText('Coupe AA')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'En cours · 1' }));
    expect(screen.getByText('Coupe AA')).toBeInTheDocument();
  });

  it('erreur de chargement des tâches', async () => {
    api.getMyTasks.mockRejectedValue(new Error('hors ligne'));
    render(<MyPerformance slug="gc" />);
    expect(await screen.findByText('Impossible de charger vos tâches.')).toBeInTheDocument();
  });
});
