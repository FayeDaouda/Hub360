import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnuairePanel } from './annuaire-panel';

const api = vi.hoisted(() => ({ getPerimetreAnnuaire: vi.fn(), reglerPerimetreAnnuaire: vi.fn() }));
vi.mock('@/lib/annuaire', async (original) => ({ ...(await original<typeof import('@/lib/annuaire')>()), ...api }));

// Administration du HUB › Annuaire (22/11/2026).
describe('AnnuairePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPerimetreAnnuaire.mockResolvedValue({ perimetre: 'societe' });
  });

  it('le périmètre en service ; un autre choix demande un motif, puis s’enregistre', async () => {
    api.reglerPerimetreAnnuaire.mockResolvedValue({ perimetre: 'groupe' });
    render(<AnnuairePanel slug="gc" />);
    const societe = await screen.findByRole('radio', { name: /La société seulement/ });
    expect(societe).toBeChecked();
    expect(screen.getByText('En service')).toBeInTheDocument();
    const enregistrer = screen.getByRole('button', { name: 'Enregistrer' });
    expect(enregistrer).toBeDisabled(); // rien de changé
    await userEvent.click(screen.getByRole('radio', { name: /Tout le groupe/ }));
    expect(enregistrer).toBeDisabled(); // pas de motif
    await userEvent.type(screen.getByLabelText(/Motif/), 'Ouverture au groupe');
    await userEvent.click(enregistrer);
    expect(api.reglerPerimetreAnnuaire).toHaveBeenCalledWith('gc', 'groupe', 'Ouverture au groupe');
    expect(await screen.findByRole('status')).toHaveTextContent('Enregistré');
    expect(screen.getByRole('radio', { name: /Tout le groupe/ })).toBeChecked();
  });

  it('refusé par le serveur : son message', async () => {
    const { ApiError } = await import('@/lib/client-api');
    api.reglerPerimetreAnnuaire.mockRejectedValue(new ApiError('Réservé au CIO et à l’Administrateur HUB.', 403));
    render(<AnnuairePanel slug="gc" />);
    await userEvent.click(await screen.findByRole('radio', { name: /direction du groupe/ }));
    await userEvent.type(screen.getByLabelText(/Motif/), 'Essai');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Réservé au CIO et à l’Administrateur HUB.')).toBeInTheDocument();
  });
});
