import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/client-api';
import { CreationRapide } from './creation-rapide';

const api = vi.hoisted(() => ({ creerRendezVous: vi.fn() }));
vi.mock('@/lib/agenda', async (original) => ({ ...(await original<typeof import('@/lib/agenda')>()), ...api }));

// Création rapide (18/11/2026).
describe('CreationRapide', () => {
  beforeEach(() => vi.clearAllMocks());
  const monter = () => {
    const p = { onClose: vi.fn(), onCree: vi.fn(), onPlusOptions: vi.fn() };
    render(
      <CreationRapide
        slug="gc"
        creneau={{ jour: '2026-11-18', debut: '14:30', fin: '15:30' }}
        ancre={{ top: 100, left: 600, right: 700, bottom: 148 }}
        {...p}
      />,
    );
    return p;
  };

  it('un titre, Entrée : créé sur le créneau (heure de Dakar), sans invités', async () => {
    api.creerRendezVous.mockResolvedValue({ id: 'R9' });
    const p = monter();
    expect(screen.getByText('Mercredi 18 novembre · 14:30 – 15:30')).toBeInTheDocument();
    const titre = screen.getByRole('textbox', { name: 'Titre du rendez-vous' });
    expect(titre).toHaveFocus();
    await userEvent.type(titre, 'Point Teranga{Enter}');
    expect(api.creerRendezVous).toHaveBeenCalledWith('gc', {
      titre: 'Point Teranga',
      debut: '2026-11-18T14:30:00.000Z',
      fin: '2026-11-18T15:30:00.000Z',
      inviteIds: [],
    });
    expect(p.onCree).toHaveBeenCalled();
  });

  it('titre trop court : refusé sans appel', async () => {
    monter();
    await userEvent.type(screen.getByRole('textbox', { name: 'Titre du rendez-vous' }), 'A{Enter}');
    expect(screen.getByText(/deux caractères/)).toBeInTheDocument();
    expect(api.creerRendezVous).not.toHaveBeenCalled();
  });

  it('« Plus d’options » ouvre le formulaire complet avec le titre saisi', async () => {
    const p = monter();
    await userEvent.type(screen.getByRole('textbox', { name: 'Titre du rendez-vous' }), 'Revue');
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’options' }));
    expect(p.onPlusOptions).toHaveBeenCalledWith('Revue');
  });

  it('refus du serveur : son message, la carte reste ouverte', async () => {
    api.creerRendezVous.mockRejectedValue(new ApiError('Créneau hors de la société.', 400));
    const p = monter();
    await userEvent.type(screen.getByRole('textbox', { name: 'Titre du rendez-vous' }), 'Revue{Enter}');
    expect(await screen.findByText('Créneau hors de la société.')).toBeInTheDocument();
    expect(p.onCree).not.toHaveBeenCalled();
  });
});
