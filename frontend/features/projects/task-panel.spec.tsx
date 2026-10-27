import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cardFixture, taskFixture } from './fixtures';
import { TaskPanel } from './task-panel';

const api = vi.hoisted(() => ({
  getTaskHistory: vi.fn(),
  getTaskWorkload: vi.fn(),
  getThread: vi.fn(),
  decideProjectTask: vi.fn(),
  requestExtension: vi.fn(),
  submitProjectTask: vi.fn(),
  downloadSubmissionPiece: vi.fn(),
  decideExtension: vi.fn(),
  setTaskVisa: vi.fn(),
  assignTask: vi.fn(),
  postComment: vi.fn(),
  resolveComment: vi.fn(),
}));
vi.mock('./api', () => api);

const props = (task = taskFixture()) => ({
  slug: 'gc',
  projectId: 'p1',
  code: 'FS_POI.26',
  card: cardFixture({ taches: [task] }),
  task,
  assignable: null,
  meId: 'u1',
  mentionable: null,
  onUpdate: vi.fn().mockResolvedValue(undefined),
});

describe('TaskPanel', () => {
  beforeEach(() => {
    api.getTaskHistory.mockResolvedValue([]);
    api.getThread.mockResolvedValue([]);
    api.decideProjectTask.mockReset().mockResolvedValue({ statut: 'validee' });
  });

  it('reprise en retard : la pastille et le résumé lisent les jours du serveur', async () => {
    render(
      <TaskPanel {...props(taskFixture({ statut: 'reprise', etat: { code: 'reprise', version: 2, jours: 4 } }))} />,
    );
    expect(screen.getByText('Reprise · 4 j de retard')).toBeInTheDocument();
    expect(screen.getByText(/4 j de retard$/, { selector: '.po-retard' })).toBeInTheDocument();
    expect(await screen.findByText('Aucun événement.')).toBeInTheDocument();
  });

  it('dépôt : le formulaire fermé puis rouvert garde sa saisie', async () => {
    render(<TaskPanel {...props(taskFixture({ peutRemettre: true }))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Déposer' }));
    const comment = screen.getByRole('textbox');
    await userEvent.type(comment, 'Version corrigée');
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Déposer' }));
    expect(screen.getByRole('textbox')).toHaveValue('Version corrigée');
  });

  it('valideur : renvoyer en reprise demande un motif, puis le dossier est relu', async () => {
    const p = props(taskFixture({ peutDecider: true, version: 1, etat: { code: 'a_valider', version: 1 } }));
    render(<TaskPanel {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Renvoyer en reprise' }));
    const send = screen.getByRole('button', { name: 'Renvoyer en reprise' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Motif de la reprise'), 'Cotes manquantes');
    await userEvent.click(send);
    expect(api.decideProjectTask).toHaveBeenCalledWith('gc', 'p1', 't1', 'renvoyer', 'Cotes manquantes');
    expect(p.onUpdate).toHaveBeenCalled();
  });

  it('erreur d’une action : le message du serveur, sous les formulaires', async () => {
    api.decideProjectTask.mockRejectedValue(new Error('Déjà décidée par un autre valideur.'));
    render(<TaskPanel {...props(taskFixture({ peutDecider: true, version: 1 }))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Valider la remise' }));
    expect(await screen.findByText('Déjà décidée par un autre valideur.')).toBeInTheDocument();
  });

  it('historique : chargement, puis les événements', async () => {
    api.getTaskHistory.mockResolvedValue([
      { id: 'e1', type: 'assignation', detail: 'Assignée à Moussa Diop', par: 'Awa Diop', le: '2026-10-02T10:00:00Z' },
    ]);
    render(<TaskPanel {...props()} />);
    const history = within(screen.getByText('Historique').parentElement!);
    expect(history.getByText('Chargement…')).toBeInTheDocument();
    expect(await history.findByText(/Assignée à Moussa Diop/)).toBeInTheDocument();
    expect(api.getTaskWorkload).not.toHaveBeenCalled(); // pas le droit d'assigner
  });
});
