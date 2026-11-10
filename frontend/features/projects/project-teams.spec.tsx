import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectTeams } from './project-teams';
import type { ProjectTeams as Teams } from './types';

const api = vi.hoisted(() => ({ getProjectTeams: vi.fn(), setProjectTeams: vi.fn() }));
vi.mock('./api', () => api);
const session = vi.hoisted(() => ({
  role: 'Dir. GC',
  utilisateur: { id: 'u1', email: 'a@b.c', nom: 'Diop', prenom: 'Awa' },
  permissions: { equipe: 'ecriture' },
}));
vi.mock('@/lib/layout-contexte', () => ({ useSessionCourante: () => session }));

const flame = { id: 'C1', code: 'FLAME', nom: 'Flame', chef: 'Salarié Essai', membres: 4 };
const nova = { id: 'C2', code: 'NOVA', nom: 'Nova', chef: null, membres: 0 };
const teams = (equipes: Teams['equipes'], disponibles: Teams['disponibles'] = [flame, nova]): Teams => ({
  equipes,
  disponibles,
});

// Équipes d'un projet : sans équipe, un bandeau le dit en tête (09/11/2026).
describe('ProjectTeams', () => {
  beforeEach(() => {
    api.getProjectTeams.mockReset();
    api.setProjectTeams.mockReset();
  });

  it('sans équipe : bandeau et bouton « Affecter une équipe » pour qui affecte', async () => {
    api.getProjectTeams.mockResolvedValue(teams([]));
    render(<ProjectTeams slug="gc" projectId="P1" canEdit />);
    expect(await screen.findByText('Ce projet n’a pas encore d’équipe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Affecter une équipe/ })).toBeInTheDocument();
  });

  it('sans équipe, en lecture : le bandeau renvoie au Dir. GC, sans bouton', async () => {
    api.getProjectTeams.mockResolvedValue(teams([]));
    render(<ProjectTeams slug="gc" projectId="P1" canEdit={false} />);
    expect(await screen.findByText(/le Dir\. GC doit l’affecter à une équipe/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Affecter une équipe/ })).not.toBeInTheDocument();
  });

  it('choix par carte (chef d’équipe, membres), puis enregistrement', async () => {
    const onChange = vi.fn();
    api.getProjectTeams.mockResolvedValue(teams([]));
    api.setProjectTeams.mockResolvedValue(teams([flame]));
    render(<ProjectTeams slug="gc" projectId="P1" canEdit onChange={onChange} />);
    await userEvent.click(await screen.findByRole('button', { name: /Affecter une équipe/ }));

    expect(screen.getByText('Chef d’équipe Salarié Essai · 4 membres')).toBeInTheDocument();
    expect(screen.getByText('Chef d’équipe à désigner · aucun membre')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Flame/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(api.setProjectTeams).toHaveBeenCalledWith('gc', 'P1', ['C1']);
    expect(onChange).toHaveBeenCalled();
    expect(await screen.findByText('Flame · chef d’équipe Salarié Essai')).toBeInTheDocument();
    expect(screen.queryByText('Ce projet n’a pas encore d’équipe')).not.toBeInTheDocument();
  });

  it('avec une équipe : pas de bandeau, « Modifier » pour qui affecte', async () => {
    api.getProjectTeams.mockResolvedValue(teams([flame]));
    render(<ProjectTeams slug="gc" projectId="P1" canEdit />);
    expect(await screen.findByText('Flame · chef d’équipe Salarié Essai')).toBeInTheDocument();
    expect(screen.queryByText('Ce projet n’a pas encore d’équipe')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
  });

  it('« Modifier » pré-coche les équipes ; « Enregistrer » attend un changement ; le focus suit', async () => {
    api.getProjectTeams.mockResolvedValue(teams([flame]));
    render(<ProjectTeams slug="gc" projectId="P1" canEdit />);
    const modify = await screen.findByRole('button', { name: 'Modifier' });
    await userEvent.click(modify);
    expect(screen.getByText('Équipes du projet')).toHaveFocus();
    expect(screen.getByRole('checkbox', { name: /Flame/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /Nova/ }));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('button', { name: 'Modifier' })).toHaveFocus();
  });

  it('échec de l’enregistrement : le message s’affiche, le choix reste ouvert', async () => {
    api.getProjectTeams.mockResolvedValue(teams([]));
    api.setProjectTeams.mockRejectedValue(new Error('Équipe inconnue dans cette société.'));
    render(<ProjectTeams slug="gc" projectId="P1" canEdit />);
    await userEvent.click(await screen.findByRole('button', { name: /Affecter une équipe/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Flame/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Équipe inconnue dans cette société.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Flame/ })).toBeChecked();
  });

  it('aucune cellule dans la société : le dit, et on peut refermer', async () => {
    api.getProjectTeams.mockResolvedValue(teams([], []));
    render(<ProjectTeams slug="gc" projectId="P1" canEdit />);
    await userEvent.click(await screen.findByRole('button', { name: /Affecter une équipe/ }));
    expect(screen.getByText(/Aucune cellule dans cette société/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.getByText('Ce projet n’a pas encore d’équipe')).toBeInTheDocument();
  });
});
