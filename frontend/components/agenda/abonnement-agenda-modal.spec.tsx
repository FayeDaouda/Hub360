import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbonnementAgendaModal } from './abonnement-agenda-modal';

const URL_FLUX = 'https://app.hub360.space/api/agenda-abonnement/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG.ics';
const api = vi.hoisted(() => ({
  getAbonnementAgenda: vi.fn(),
  creerAbonnementAgenda: vi.fn(),
  supprimerAbonnementAgenda: vi.fn(),
}));
vi.mock('@/lib/agenda', async (original) => ({ ...(await original<typeof import('@/lib/agenda')>()), ...api }));
const confirmer = vi.hoisted(() => vi.fn());
vi.mock('@/components/confirmation', () => ({ useConfirmer: () => confirmer }));

// « Ajouter à mon agenda » (12/11/2026).
describe('AbonnementAgendaModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.creerAbonnementAgenda.mockResolvedValue({ url: URL_FLUX });
    confirmer.mockResolvedValue(true);
  });

  it('sans lien : le créer affiche le lien, Google Agenda et webcal', async () => {
    api.getAbonnementAgenda.mockResolvedValue({ actif: false, creeLe: null, dernierAccesLe: null });
    render(<AbonnementAgendaModal slug="grey-concrete" onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer mon lien' }));
    expect(confirmer).not.toHaveBeenCalled(); // rien à remplacer
    expect(await screen.findByLabelText('Lien de votre agenda')).toHaveValue(URL_FLUX);
    expect(screen.getByRole('link', { name: 'Google Agenda' })).toHaveAttribute(
      'href',
      `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(URL_FLUX)}`, // https, jamais webcal
    );
    expect(screen.getByRole('link', { name: /Apple/ })).toHaveAttribute('href', URL_FLUX.replace('https:', 'webcal:'));
  });

  it('lien déjà actif : il ne se réaffiche pas ; en générer un nouveau demande confirmation', async () => {
    api.getAbonnementAgenda.mockResolvedValue({
      actif: true,
      creeLe: '2026-11-10T09:00:00.000Z',
      dernierAccesLe: null,
    });
    render(<AbonnementAgendaModal slug="grey-concrete" onClose={vi.fn()} />);
    expect(await screen.findByText(/Votre agenda ne l’a pas encore lu/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Lien de votre agenda')).not.toBeInTheDocument();
    confirmer.mockResolvedValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Générer un nouveau lien' }));
    expect(api.creerAbonnementAgenda).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Générer un nouveau lien' }));
    expect(await screen.findByLabelText('Lien de votre agenda')).toHaveValue(URL_FLUX);
  });

  it('désactiver : après confirmation, le lien est supprimé', async () => {
    api.getAbonnementAgenda.mockResolvedValue({
      actif: true,
      creeLe: '2026-11-10T09:00:00.000Z',
      dernierAccesLe: null,
    });
    api.supprimerAbonnementAgenda.mockResolvedValue({ ok: true });
    render(<AbonnementAgendaModal slug="grey-concrete" onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Désactiver' }));
    expect(api.supprimerAbonnementAgenda).toHaveBeenCalledWith('grey-concrete');
    expect(await screen.findByRole('button', { name: 'Créer mon lien' })).toBeInTheDocument();
  });
});
