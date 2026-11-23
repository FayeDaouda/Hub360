import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Menu } from './menu';

// Menu déroulant (18/11/2026).
describe('Menu', () => {
  const monter = () => {
    const a = vi.fn();
    const b = vi.fn();
    render(
      <Menu
        libelle="Plus d’options"
        declencheur="⋯"
        elements={[
          { cle: 'a', libelle: 'Ajouter à mon agenda', onChoisir: a },
          { cle: 'b', libelle: 'Agendas connectés', onChoisir: b },
        ]}
      />,
    );
    return { a, b, bouton: screen.getByRole('button', { name: 'Plus d’options' }) };
  };

  it('fermé par défaut ; ouvert, le premier élément a le focus', async () => {
    const { bouton } = monter();
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(bouton);
    expect(bouton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Ajouter à mon agenda' })).toHaveFocus();
  });

  it('flèches pour circuler, Entrée choisit et referme', async () => {
    const { b, bouton } = monter();
    await userEvent.click(bouton);
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Agendas connectés' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}'); // boucle
    expect(screen.getByRole('menuitem', { name: 'Ajouter à mon agenda' })).toHaveFocus();
    await userEvent.keyboard('{End}{Enter}');
    expect(b).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(bouton).toHaveFocus();
  });

  it('Échap referme et rend le focus au bouton ; un clic dehors referme', async () => {
    const { a, bouton } = monter();
    await userEvent.click(bouton);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(bouton).toHaveFocus();
    await userEvent.click(bouton);
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(a).not.toHaveBeenCalled();
  });

  it('choix exclusifs : coché annoncé, et il reçoit le focus', async () => {
    render(
      <Menu
        libelle="Vue"
        declencheur="Vue"
        elements={[
          { cle: 'j', libelle: 'Jour', coche: false, onChoisir: vi.fn() },
          { cle: 's', libelle: 'Semaine', coche: true, onChoisir: vi.fn() },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Vue' }));
    const semaine = screen.getByRole('menuitemradio', { name: 'Semaine' });
    expect(semaine).toHaveAttribute('aria-checked', 'true');
    expect(semaine).toHaveFocus();
  });
});
