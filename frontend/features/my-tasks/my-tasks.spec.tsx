import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayIso } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { myTaskFixture as tache, myTasksViewFixture } from './fixtures';
import { MyTasks } from './my-tasks';

const api = vi.hoisted(() => ({
  getMyTasks: vi.fn(),
  getTasksToReview: vi.fn(),
  submitTask: vi.fn(),
  remindReviewer: vi.fn(),
}));
vi.mock('./api', () => api);
vi.mock('./task-drawer', () => ({ TaskDrawer: () => null }));
// Fenêtre de dépôt réduite à son envoi : le formulaire a ses propres tests.
vi.mock('./submission-modal', () => ({
  SubmissionModal: ({ onSend }: { onSend: (body: object) => void }) => (
    <button type="button" onClick={() => onSend({})}>
      Confirmer le dépôt
    </button>
  ),
}));
vi.mock('@/lib/demandes', () => ({ getAbsencesAValider: () => Promise.resolve([]) }));
vi.mock('@/features/projects/api', () => ({
  getMyMentions: () => Promise.resolve([]),
  markMentionRead: vi.fn(),
  postComment: vi.fn(),
}));
vi.mock('@/lib/layout-contexte', () => ({
  useTitrePage: () => undefined,
  useSessionCourante: () => ({ utilisateur: { id: 'u1', email: 'a@b.c', nom: 'Ndoye', prenom: 'Rokhaya' } }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/media', () => ({ useMediaQuery: () => false }));
vi.mock('@/lib/entete-fixe', () => ({ useEnteteFixe: () => undefined }));

// Échéances relatives à aujourd'hui (heure de Dakar, comme la page).
const day = (offset: number) => {
  const d = new Date(`${todayIso()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

describe('MyTasks', () => {
  // Corps entre accolades : une fonction renvoyée par beforeEach serait
  // rappelée par Vitest comme nettoyage (cf. features/teams).
  beforeEach(() => {
    api.getMyTasks.mockReset();
    api.submitTask.mockReset();
    api.getTasksToReview.mockResolvedValue([]);
  });

  it('chargement, puis le salut et les sections par urgence', async () => {
    const late = tache({
      id: 'a',
      libelle: 'Relevé de géomètre',
      statut: 'en_retard',
      echeance: day(-3),
      dateEffective: day(-3),
      enRetard: true,
    });
    api.getMyTasks.mockResolvedValue(myTasksViewFixture([late]));
    const { container } = render(<MyTasks slug="gc" />);
    expect(container.querySelector('.admin-skeleton')).not.toBeNull();
    expect(await screen.findByRole('heading', { name: /Rokhaya/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'En retard' })).toBeInTheDocument();
    expect(screen.getByText('3 j de retard')).toBeInTheDocument();
    expect(screen.getByText('1 tâche demande votre attention', { exact: false })).toBeInTheDocument();
  });

  it('erreur de chargement : le message du serveur, sinon un message de repli', async () => {
    api.getMyTasks.mockRejectedValue(new ApiError('Tâches indisponibles pour le moment.', 503));
    const { unmount } = render(<MyTasks slug="gc" />);
    expect(await screen.findByText('Tâches indisponibles pour le moment.')).toBeInTheDocument();
    unmount();
    api.getMyTasks.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<MyTasks slug="gc" />);
    expect(await screen.findByText('Impossible de charger vos tâches.')).toBeInTheDocument();
  });

  it('rien d’urgent : « Tout est à jour »', async () => {
    api.getMyTasks.mockResolvedValue(myTasksViewFixture([tache({ echeance: day(30), dateEffective: day(30) })]));
    render(<MyTasks slug="gc" />);
    expect(await screen.findByText('Tout est à jour')).toBeInTheDocument();
    expect(screen.getByText('Plus tard · 1')).toBeInTheDocument();
  });

  it('un filtre n’affiche que sa liste ; « Tout afficher » revient à la vue complète', async () => {
    api.getMyTasks.mockResolvedValue(
      myTasksViewFixture([
        tache({
          id: 'a',
          libelle: 'Façade nord',
          statut: 'a_reprendre',
          renvoiMotif: 'Cotes manquantes',
          echeance: day(10),
          dateEffective: day(10),
        }),
        tache({ id: 'b', libelle: 'Coupe AA', echeance: day(0), dateEffective: day(0) }),
      ]),
    );
    render(<MyTasks slug="gc" />);
    await userEvent.click(await screen.findByRole('button', { name: /À reprendre.*renvoyées/ }));
    expect(screen.getByText('Cotes manquantes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Coupe AA' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Tout afficher/ }));
    expect(screen.getByRole('button', { name: 'Coupe AA' })).toBeInTheDocument();
  });

  it('N+1 : le bandeau dit ce qui attend sa décision', async () => {
    api.getMyTasks.mockResolvedValue(myTasksViewFixture([]));
    api.getTasksToReview.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    render(<MyTasks slug="gc" />);
    expect(await screen.findByText(/2 tâches remises/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Décider' })).toHaveAttribute(
      'href',
      '/admin/gc/mon-espace?onglet=a-valider',
    );
  });

  it('dépôt différé : « Annuler » le retire sans rien envoyer', async () => {
    const t = tache({ id: 'a', libelle: 'Note de calcul', echeance: day(1), dateEffective: day(1) });
    api.getMyTasks.mockResolvedValue(myTasksViewFixture([t]));
    render(<MyTasks slug="gc" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Déposer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer le dépôt' }));
    expect(screen.getByText('« Note de calcul » déposée')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'En attente de validation' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByText('« Note de calcul » déposée')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'En attente de validation' })).not.toBeInTheDocument();
    expect(api.submitTask).not.toHaveBeenCalled();
  });
});
