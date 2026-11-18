import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EtatConnexions } from '@/lib/agenda';
import { AgendasConnectes } from './agendas-connectes';

const api = vi.hoisted(() => ({
  getConnexions: vi.fn(),
  connecterGoogle: vi.fn(),
  confirmerGoogle: vi.fn(),
  afficherAgendaExterne: vi.fn(),
  choisirCibleAgenda: vi.fn(),
  activerConnexion: vi.fn(),
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
      active: true,
      derniereSynchroLe: '2026-11-16T10:00:00.000Z',
      erreur: null,
      agendas: [
        { id: 'A1', nom: 'Awa', couleur: '#123456', importe: true, cible: true, proprietaire: true },
        { id: 'A2', nom: 'Famille', couleur: null, importe: false, cible: false, proprietaire: false },
      ],
    },
    {
      id: 'C2',
      fournisseur: 'google',
      compte: 'awa.perso@gmail.com',
      active: true,
      derniereSynchroLe: '2026-11-16T10:00:00.000Z',
      erreur: null,
      agendas: [{ id: 'B1', nom: 'Perso', couleur: '#33b679', importe: true, cible: false, proprietaire: true }],
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

  it('plusieurs comptes : chacun ses agendas, affichés d’un clic ; « Connecter un autre compte »', async () => {
    api.getConnexions.mockResolvedValue(CONNECTE);
    api.afficherAgendaExterne.mockResolvedValue(CONNECTE);
    const onChange = vi.fn();
    render(<AgendasConnectes slug="gc" onClose={vi.fn()} onChange={onChange} />);
    const pro = await screen.findByRole('region', { name: 'Google Agenda · awa@gc.sn' });
    expect(screen.getByRole('region', { name: 'Google Agenda · awa.perso@gmail.com' })).toBeInTheDocument();
    expect(within(pro).getByText('Le HUB y écrit')).toBeInTheDocument();
    // Effet immédiat, sans bouton Enregistrer.
    await userEvent.click(within(pro).getByLabelText('Afficher Famille dans le HUB'));
    expect(api.afficherAgendaExterne).toHaveBeenCalledWith('gc', 'C1', 'A2', true);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Connecter un autre compte Google' })).toBeInTheDocument();
  });

  it('où le HUB écrit : un seul agenda à soi, tous comptes confondus (jamais un agenda partagé)', async () => {
    api.getConnexions.mockResolvedValue(CONNECTE);
    api.choisirCibleAgenda.mockResolvedValue(CONNECTE);
    render(<AgendasConnectes slug="gc" onClose={vi.fn()} onChange={vi.fn()} />);
    const choix = await screen.findByRole('combobox', { name: /Où le HUB écrit vos réunions/ });
    expect(choix).toHaveValue('A1');
    const options = within(choix)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Nulle part', 'Awa · awa@gc.sn', 'Perso · awa.perso@gmail.com']);
    await userEvent.selectOptions(choix, 'B1');
    expect(api.choisirCibleAgenda).toHaveBeenCalledWith('gc', 'B1');
    await userEvent.selectOptions(choix, '');
    expect(api.choisirCibleAgenda).toHaveBeenLastCalledWith('gc', null);
  });

  it('la cible sur un compte en pause reste montrée, mais plus choisissable', async () => {
    api.getConnexions.mockResolvedValue({
      ...CONNECTE,
      connexions: [{ ...CONNECTE.connexions[0], active: false }, CONNECTE.connexions[1]],
    });
    render(<AgendasConnectes slug="gc" onClose={vi.fn()} onChange={vi.fn()} />);
    const choix = await screen.findByRole('combobox', { name: /Où le HUB écrit vos réunions/ });
    expect(choix).toHaveValue('A1');
    expect(within(choix).getByRole('option', { name: 'Awa · awa@gc.sn (en pause)' })).toBeDisabled();
  });

  it('interrupteur : un compte mis en pause (ses agendas masqués), puis réactivé', async () => {
    const enPause: EtatConnexions = {
      ...CONNECTE,
      connexions: [{ ...CONNECTE.connexions[0], active: false }, CONNECTE.connexions[1]],
    };
    api.getConnexions.mockResolvedValue(CONNECTE);
    api.activerConnexion.mockResolvedValueOnce(enPause).mockResolvedValueOnce(CONNECTE);
    render(<AgendasConnectes slug="gc" onClose={vi.fn()} onChange={vi.fn()} />);
    const interrupteur = await screen.findByRole('switch', { name: /awa@gc.sn : synchronisation activée/ });
    expect(interrupteur).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(interrupteur);
    expect(api.activerConnexion).toHaveBeenCalledWith('gc', 'C1', false);
    const pro = screen.getByRole('region', { name: 'Google Agenda · awa@gc.sn' });
    expect(await within(pro).findByText('En pause : rien ne se synchronise.')).toBeInTheDocument();
    expect(within(pro).queryByLabelText('Afficher Awa dans le HUB')).not.toBeInTheDocument();
    // Un compte en pause n'est plus choisissable pour écrire (sa cible reste montrée).
    expect(screen.getByRole('option', { name: 'Awa · awa@gc.sn (en pause)' })).toBeDisabled();
    await userEvent.click(within(pro).getByRole('switch'));
    expect(api.activerConnexion).toHaveBeenLastCalledWith('gc', 'C1', true);
  });

  it('retour de Google : la session confirme le ticket, une seule fois', async () => {
    api.confirmerGoogle.mockResolvedValue(CONNECTE);
    const onChange = vi.fn();
    const { rerender } = render(
      <AgendasConnectes slug="gc" resultat="confirmer" ticket="TICKET" onClose={vi.fn()} onChange={onChange} />,
    );
    expect(await screen.findByText(/Compte Google relié/)).toBeInTheDocument();
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
    expect(screen.queryByText(/Compte Google relié/)).not.toBeInTheDocument();
  });

  it('déconnecter : après confirmation seulement', async () => {
    const seul = { ...CONNECTE, connexions: [CONNECTE.connexions[0]] };
    api.getConnexions.mockResolvedValue(seul);
    api.deconnecterAgenda.mockResolvedValue({ disponibles: { google: true, apple: false }, connexions: [] });
    render(<AgendasConnectes slug="gc" onClose={vi.fn()} onChange={vi.fn()} />);
    confirmer.mockResolvedValueOnce(false);
    await userEvent.click(await screen.findByRole('button', { name: 'Déconnecter' }));
    expect(api.deconnecterAgenda).not.toHaveBeenCalled();
    expect(confirmer).toHaveBeenCalledWith(expect.objectContaining({ titre: 'Déconnecter awa@gc.sn ?' }));
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
        CONNECTE.connexions[1],
      ],
    });
    render(<AgendasConnectes slug="gc" onClose={vi.fn()} onChange={vi.fn()} />);
    expect(await screen.findByText(/reconnectez le compte/)).toBeInTheDocument();
  });
});
