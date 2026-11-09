import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectPicker } from './project-picker';
import { countProjects, visibleProjects } from './project-picker-model';
import type { OpenProjectSummary, OpenProjectsBoard } from './types';

const project = (o: Partial<OpenProjectSummary> & { id: string; code: string }): OpenProjectSummary => ({
  client: 'Client',
  cellule: 'FLAME',
  jour: 3,
  horizon: 40,
  faites: 1,
  total: 10,
  enRetard: 0,
  livraisonDepassee: false,
  ...o,
});

const projects = [
  project({ id: 'a', code: 'AAA.26', client: 'Awa Diop' }),
  project({ id: 'b', code: 'BBB.26', client: 'Bineta Sow', cellule: null }),
  project({ id: 'c', code: 'CCC.26', client: 'Cheikh Fall', enRetard: 2 }),
  project({ id: 'd', code: 'DDD.26', client: 'Déthié Ndiaye', enRetard: 5 }),
  project({ id: 'e', code: 'EEE.26', client: 'Élodie Gaye', livraisonDepassee: true }),
];
const board = { gabarit: 'GC-CONCEPTION', budgetHeures: 320, projets: projects } as unknown as OpenProjectsBoard;
const codes = () => screen.getAllByRole('option').map((o) => o.textContent?.slice(0, 6));

describe('sélecteur de projets · modèle', () => {
  it('trie par urgence : livraison dépassée, retards (le plus d’abord), sans équipe, dans les délais', () => {
    expect(visibleProjects(projects, 'all', '').map((p) => p.id)).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('filtre « En retard » et « Sans équipe », recherche sans accents sur le code et le client', () => {
    expect(visibleProjects(projects, 'late', '').map((p) => p.id)).toEqual(['e', 'd', 'c']);
    expect(visibleProjects(projects, 'noTeam', '').map((p) => p.id)).toEqual(['b']);
    expect(visibleProjects(projects, 'all', 'elodie').map((p) => p.id)).toEqual(['e']);
    expect(visibleProjects(projects, 'all', 'ccc').map((p) => p.id)).toEqual(['c']);
    expect(countProjects(projects)).toEqual({ total: 5, late: 3, noTeam: 1 });
  });
});

describe('ProjectPicker', () => {
  it('montre le projet ouvert et le résumé ; la liste s’ouvre au clic, triée par urgence', async () => {
    render(<ProjectPicker board={board} projectId="a" onSelect={vi.fn()} showTeams />);
    const trigger = screen.getByRole('button', { name: /AAA\.26/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('5 projets ouverts · 3 en retard · 1 sans équipe')).toBeInTheDocument();

    await userEvent.click(trigger);
    expect(codes()).toEqual(['EEE.26', 'DDD.26', 'CCC.26', 'BBB.26', 'AAA.26']);
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('AAA.26');
  });

  it('filtres « En retard » et « Sans équipe », puis recherche et Entrée choisissent le projet', async () => {
    const onSelect = vi.fn();
    render(<ProjectPicker board={board} projectId="a" onSelect={onSelect} showTeams />);
    await userEvent.click(screen.getByRole('button', { name: /AAA\.26/ }));

    await userEvent.click(screen.getByRole('button', { name: /En retard/, pressed: false }));
    expect(codes()).toEqual(['EEE.26', 'DDD.26', 'CCC.26']);
    await userEvent.click(screen.getByRole('button', { name: /Sans équipe/, pressed: false }));
    expect(codes()).toEqual(['BBB.26']);

    await userEvent.click(screen.getByRole('button', { name: /Tous/ }));
    await userEvent.type(screen.getByRole('combobox'), 'cheikh{Enter}');
    expect(onSelect).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('flèches (bas, puis haut qui revient en fin de liste) et Entrée ; Échap rend le focus au bouton', async () => {
    const onSelect = vi.fn();
    render(<ProjectPicker board={board} projectId="a" onSelect={onSelect} showTeams />);
    const trigger = screen.getByRole('button', { name: /AAA\.26/ });
    await userEvent.click(trigger);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('d');

    await userEvent.click(trigger);
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('a');

    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('un clic hors du sélecteur le referme', async () => {
    render(
      <>
        <p>Dossier</p>
        <ProjectPicker board={board} projectId="a" onSelect={vi.fn()} showTeams />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: /AAA\.26/ }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Dossier'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Salarié : ni filtre, ni compteur, ni pastille « Sans équipe »', async () => {
    render(<ProjectPicker board={board} projectId="a" onSelect={vi.fn()} showTeams={false} />);
    expect(screen.getByText('5 projets ouverts · 3 en retard')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /AAA\.26/ }));
    expect(screen.queryByRole('button', { name: /Sans équipe/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).queryByText('Sans équipe')).not.toBeInTheDocument();
  });

  it('aucun résultat : le dit', async () => {
    render(<ProjectPicker board={board} projectId="a" onSelect={vi.fn()} showTeams />);
    await userEvent.click(screen.getByRole('button', { name: /AAA\.26/ }));
    await userEvent.type(screen.getByRole('combobox'), 'zzz');
    expect(screen.getByText('Aucun projet pour « zzz »')).toBeInTheDocument();
  });
});
