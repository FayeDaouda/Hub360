import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/client-api';
import { MySpace } from './my-space';
import type { MyFile } from './types';

const api = vi.hoisted(() => ({ getMySpace: vi.fn() }));
const session = vi.hoisted(() => ({ role: 'Salarié' }));
const navigation = vi.hoisted(() => ({ onglet: null as string | null }));
vi.mock('./api', () => api);
vi.mock('@/features/my-tasks/api', () => ({ getTasksToReview: () => Promise.resolve([]) }));
vi.mock('@/lib/demandes', () => ({ getAbsencesAValider: () => Promise.resolve([]) }));
vi.mock('@/lib/notifications', () => ({
  getNonLuesParType: () => Promise.resolve({}),
  marquerTypesLus: () => Promise.resolve(),
}));
vi.mock('@/lib/layout-contexte', () => ({
  useTitrePage: () => undefined,
  useSessionCourante: () => ({
    role: session.role,
    utilisateur: { id: 'u1', email: 'a@b.c', nom: 'Ndoye', prenom: 'Rokhaya' },
  }),
}));
vi.mock('@/lib/entete-fixe', () => ({ useEnteteFixe: () => undefined }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/gc/mon-espace',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.onglet ? `onglet=${navigation.onglet}` : ''),
}));
// Chaque onglet a ses propres tests : ici, seulement lequel s'affiche.
vi.mock('./performance', () => ({ MyPerformance: () => <p>onglet performances</p> }));
vi.mock('./to-review', () => ({ ToReview: () => <p>onglet à valider</p> }));
vi.mock('./my-time', () => ({ MyTime: () => null }));
vi.mock('./my-cell', () => ({ MyCell: () => null }));
vi.mock('./leave-requests', () => ({ LeaveRequests: () => null }));
vi.mock('./health-refunds', () => ({ HealthRefunds: () => null }));
vi.mock('./personal-info', () => ({ PersonalInfo: () => <p>onglet informations</p> }));
vi.mock('./documents', () => ({ MyDocuments: () => null }));

const FILE = {
  prenom: 'Rokhaya',
  nom: 'Ndoye',
  poste: 'Dessinatrice',
  societe: 'Grey Concrete',
  cellule: 'Architecture 1',
  photo: null,
  typeContrat: 'cdi',
  dateEntree: '2025-09-01',
  mission: null,
} as unknown as MyFile;

describe('MySpace', () => {
  // jsdom n'a pas scrollIntoView (l'onglet actif est ramené dans la vue sur mobile).
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    api.getMySpace.mockReset();
    session.role = 'Salarié';
    navigation.onglet = null;
  });

  it('chargement, puis le dossier en tête et le premier onglet', async () => {
    api.getMySpace.mockResolvedValue({ dossier: FILE });
    const { container } = render(<MySpace slug="gc" />);
    expect(container.querySelector('.admin-skeleton')).not.toBeNull();
    expect(await screen.findByText(/Dessinatrice · Grey Concrete · Architecture 1/)).toBeInTheDocument();
    expect(screen.getByText('onglet performances')).toBeInTheDocument();
  });

  it('erreur de chargement : le message du serveur', async () => {
    api.getMySpace.mockRejectedValue(new ApiError('Espace indisponible.', 503));
    render(<MySpace slug="gc" />);
    expect(await screen.findByText('Espace indisponible.')).toBeInTheDocument();
  });

  it('sans dossier du personnel : les rubriques du dossier l’expliquent', async () => {
    navigation.onglet = 'informations';
    api.getMySpace.mockResolvedValue({ dossier: null });
    render(<MySpace slug="gc" />);
    expect(await screen.findByText('Aucun dossier du personnel relié à ce compte')).toBeInTheDocument();
    expect(screen.getByText(/la RH doit l’ouvrir/)).toBeInTheDocument();
    expect(screen.queryByText('onglet informations')).not.toBeInTheDocument();
  });

  it('CEO : l’espace s’ouvre sur « À valider »', async () => {
    session.role = 'CEO (transverse)';
    api.getMySpace.mockResolvedValue({ dossier: FILE });
    render(<MySpace slug="gc" />);
    expect(await screen.findByText('onglet à valider')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Mes performances' })).not.toBeInTheDocument();
  });
});
