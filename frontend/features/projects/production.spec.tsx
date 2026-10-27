import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productionRowFixture, productionViewFixture } from './fixtures';
import { Production } from './production';

const api = vi.hoisted(() => ({ getProduction: vi.fn() }));
vi.mock('./api', () => api);
vi.mock('@/lib/rentabilite', () => ({ getRentabilite: vi.fn() }));
vi.mock('@/lib/layout-contexte', () => ({
  useSessionCourante: () => ({ role: 'CTO (transverse)', permissions: { finances_marges: 'aucun' } }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('Production', () => {
  beforeEach(() => {
    api.getProduction.mockReset();
  });

  it('chargement, puis les projets ; le filtre des livraisons suit l’indicateur du serveur', async () => {
    api.getProduction.mockResolvedValue(
      productionViewFixture([
        productionRowFixture(),
        productionRowFixture({
          projet: { id: 'p2', code: 'DFS_ALM.26', client: 'Alima', cellule: null },
          livraisonProche: true,
        }),
      ]),
    );
    const { container } = render(<Production slug="gc" />);
    expect(container.querySelector('.skeleton, [aria-busy]')).not.toBeNull();
    expect(await screen.findByRole('heading', { name: 'Projets · 2' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Livraisons sous 15 jours/ }));
    expect(screen.getByRole('heading', { name: 'Projets · 1 sur 2' })).toBeInTheDocument();
    expect(screen.getByText('DFS_ALM.26')).toBeInTheDocument();
    expect(screen.queryByText('FS_POI.26')).not.toBeInTheDocument();
  });

  it('aucun projet pour les filtres, puis erreur du serveur', async () => {
    api.getProduction.mockResolvedValue(productionViewFixture([]));
    const { unmount } = render(<Production slug="gc" />);
    expect(await screen.findByText('Aucun projet pour ces filtres.')).toBeInTheDocument();
    unmount();
    api.getProduction.mockRejectedValue(
      new Error('Le tableau de production est réservé au Dir. GC, au CTO et au CEO.'),
    );
    render(<Production slug="gc" />);
    expect(await screen.findByText(/réservé au Dir\. GC/)).toBeInTheDocument();
  });
});
