import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EtatConnexions } from '@/lib/agenda';
import { AgendasConnectes } from './agendas-connectes';

const api = vi.hoisted(() => ({
  getConnexions: vi.fn(),
  connecterGoogle: vi.fn(),
  confirmerGoogle: vi.fn(),
  choisirAgendas: vi.fn(),
  synchroniserConnexion: vi.fn(),
  deconnecterAgenda: vi.fn(),
}));
vi.mock('@/lib/agenda', async (original) => ({ ...(await original<typeof import('@/lib/agenda')>()), ...api }));
const confirmer = vi.hoisted(() => vi.fn());
vi.mock('@/components/confirmation', () => ({ useConfirmer: () => confirmer }));

const CONNECTE: EtatConnexions = {
  disponibles: { google: true, apple: false },
  connexions: [
    {
      id: 'C1',
      fournisseur: 'google',
      compte: 'awa@gc.sn',
      derniereSynchroLe: '2026-11-16T10:00:00.000Z',
      erreur: null,
      agendas: [
        { id: 'A1', nom: 'Awa', couleur: '#123456', importe: true, cible: true, proprietaire: true },
        { id: 'A2', nom: 'Famille', couleur: null, importe: false, cible: false, proprietaire: false },
      ],
    },
  ],
};

// Agendas connectés (16/11/2026).
describe('AgendasConnectes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pas encore activé sur ce HUB : rien à connecter', async () => {
    api.getConnexions.mockResolvedValue({ disponibles: { google: false, apple: false }, connexions: [] });
    render(<AgendasConnectes slug="gc" onClose={vi.fn()} onChange={vi.fn()} />);
    expect(await screen.findByText(/sera proposée dès qu’elle aura été activée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connecter Google Agenda' })).not.toBeInTheDocument();
  });

  it('connecter : la personne part autoriser chez Google', async () => {
    api.getConnexions.mockResolvedValue({ disponibles: { google: true, apple: false }, connexions: [] });
    api.connecterGoogle.mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x' });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, assign }, writable: true });
    render(<AgendasConnectes slug="gc" onClose={vi.fn()} onChange={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Connecter Google Agenda' }));
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x');
  });

  it('connecté : choisir les agendas à afficher et celui où le HUB écrit', async () => {
    api.getConnexions.mockResolvedValue(CONNECTE);
    api.choisirAgendas.mockResolvedValue(CONNECTE);
    const onChange = vi.fn();
    render(<AgendasConnectes slug="gc" resultat="google" onClose={vi.fn()} onChange={onChange} />);
    expect(await screen.findByText(/Google Agenda est connecté/)).toBeInTheDocument();
    expect(screen.getByText('awa@gc.sn')).toBeInTheDocument();
    const enregistrer = screen.getByRole('button', { name: 'Enregistrer' });
    expect(enregistrer).toBeDisabled(); // rien de changé
    await userEvent.click(screen.getByLabelText('Afficher Famille dans le HUB'));
    await userEvent.click(screen.getByLabelText('Le HUB n’écrit ses réunions nulle part'));
    await userEvent.click(enregistrer);
    expect(api.choisirAgendas).toHaveBeenCalledWith('gc', 'C1', ['A1', 'A2'], null);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('retour de Google : la session confirme le ticket, une seule fois', async () => {
    api.confirmerGoogle.mockResolvedValue(CONNECTE);
    const onChange = vi.fn();
    const { rerender } = render(
      <AgendasConnectes slug="gc" resultat="confirmer" ticket="TICKET" onClose={vi.fn()} onChange={onChange} />,
    );
    expect(await screen.findByText(/Google Agenda est connecté/)).toBeInTheDocument();
    rerender(<AgendasConnectes slug="gc" resultat="confirmer" ticket="TICKET" onClose={vi.fn()} onChange={onChange} />);
    expect(api.confirmerGoogle).toHaveBeenCalledTimes(1);
    expect(api.confirmerGoogle).toHaveBeenCalledWith('gc', 'TICKET');
    expect(api.getConnexions).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalled();
  });

  it('retour de Google refusé (autre compte du HUB) : le message du serveur, rien de relié', async () => {
    const { ApiError } = await import('@/lib/client-api');
    api.confirmerGoogle.mockRejectedValue(
      new ApiError('Cette autorisation Google a été lancée depuis un autre compte du HUB.', 403),
    );
    api.getConnexions.mockResolvedValue({ disponibles: { google: true, apple: false }, connexions: [] });
    render(<AgendasConnectes slug="gc" resultat="confirmer" ticket="T" onClose={vi.fn()} onChange={vi.fn()} />);
    expect(await screen.findByText(/lancée depuis un autre compte/)).toBeInTheDocument();
    expect(screen.queryByText(/Google Agenda est connecté/)).not.toBeInTheDocument();
  });

  it('un agenda partagé ne peut pas recevoir les réunions du HUB', async () => {
    api.getConnexions.mockResolvedValue(CONNECTE);
    render(<AgendasConnectes slug="gc" onClose={vi.fn()} onChange={vi.fn()} />);
    expect(await screen.findByLabelText('Famille : agenda partagé, le HUB n’y écrit pas')).toBeDisabled();
    expect(screen.getByLabelText('Le HUB écrit ses réunions dans Awa')).toBeEnabled();
  });

  it('déconnecter : après confirmation seulement', async () => {
    api.getConnexions.mockResolvedValue(CONNECTE);
    api.deconnecterAgenda.mockResolvedValue({ disponibles: { google: true, apple: false }, connexions: [] });
    render(<AgendasConnectes slug="gc" onClose={vi.fn()} onChange={vi.fn()} />);
    confirmer.mockResolvedValueOnce(false);
    await userEvent.click(await screen.findByRole('button', { name: 'Déconnecter' }));
    expect(api.deconnecterAgenda).not.toHaveBeenCalled();
    confirmer.mockResolvedValueOnce(true);
    await userEvent.click(screen.getByRole('button', { name: 'Déconnecter' }));
    expect(api.deconnecterAgenda).toHaveBeenCalledWith('gc', 'C1');
    expect(await screen.findByRole('button', { name: 'Connecter Google Agenda' })).toBeInTheDocument();
  });

  it('une erreur de synchronisation est montrée à la personne', async () => {
    api.getConnexions.mockResolvedValue({
      ...CONNECTE,
      connexions: [
        { ...CONNECTE.connexions[0], erreur: 'L’accès à Google Agenda a été retiré : reconnectez le compte.' },
      ],
    });
    render(<AgendasConnectes slug="gc" onClose={vi.fn()} onChange={vi.fn()} />);
    expect(await screen.findByText(/reconnectez le compte/)).toBeInTheDocument();
  });
});
