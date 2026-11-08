import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MenuActions, type ActionMenu } from './menu-actions';

const actions = (maj: Partial<Record<string, Partial<ActionMenu>>> = {}): ActionMenu[] =>
  [
    { cle: 'exporter', libelle: 'Exporter', onClick: vi.fn() },
    { cle: 'imprimer', libelle: 'Imprimer', onClick: vi.fn() },
    { cle: 'supprimer', libelle: 'Supprimer', onClick: vi.fn() },
  ].map((a) => ({ ...a, ...maj[a.cle] }));

const liste = () => screen.getByRole('list');

describe('MenuActions — variante par défaut (en-tête de Facturation)', () => {
  it('affiche « Plus d’actions » en texte visible, menu fermé', () => {
    render(<MenuActions actions={actions()} />);
    const bouton = screen.getByRole('button', { name: /Plus d’actions/ });
    expect(bouton).toHaveTextContent('Plus d’actions');
    expect(bouton).toHaveClass('btn-ghost', 'menu-actions-bouton');
    expect(bouton).not.toHaveAttribute('aria-label');
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('ouvre la liste au clic, alignée à gauche par défaut', async () => {
    render(<MenuActions actions={actions()} />);
    const bouton = screen.getByRole('button', { name: /Plus d’actions/ });
    await userEvent.click(bouton);
    expect(bouton).toHaveAttribute('aria-expanded', 'true');
    expect(liste()).toHaveAttribute('id', bouton.getAttribute('aria-controls'));
    expect(liste()).toHaveClass('menu-actions-liste');
    expect(liste()).not.toHaveClass('menu-actions-liste--droite');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('exécute l’action choisie et referme la liste', async () => {
    const liste3 = actions();
    render(<MenuActions actions={liste3} />);
    await userEvent.click(screen.getByRole('button', { name: /Plus d’actions/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Imprimer' }));
    expect(liste3[1].onClick).toHaveBeenCalledTimes(1);
    expect(liste3[0].onClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('ne rend rien quand il n’y a aucune action', () => {
    const { container } = render(<MenuActions actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('applique la classe supplémentaire passée en className', () => {
    const { container } = render(<MenuActions actions={actions()} className="fin-outils-menu" />);
    expect(container.firstElementChild).toHaveClass('menu-actions', 'fin-outils-menu');
  });
});

describe('MenuActions — variante icône (bout de ligne)', () => {
  it('donne au bouton le libellé comme nom accessible, sans texte visible', () => {
    render(<MenuActions actions={actions()} variante="icone" libelle="Actions pour Fatou Diop" />);
    const bouton = screen.getByRole('button', { name: 'Actions pour Fatou Diop' });
    expect(bouton).toHaveAttribute('aria-label', 'Actions pour Fatou Diop');
    expect(bouton).toHaveAttribute('title', 'Actions pour Fatou Diop');
    expect(bouton).toHaveClass('menu-actions-bouton--icone');
    expect(bouton).toHaveTextContent('');
    expect(screen.queryByText(/Plus d’actions/)).not.toBeInTheDocument();
  });

  it('reflète l’ouverture dans aria-expanded', async () => {
    render(<MenuActions actions={actions()} variante="icone" libelle="Actions pour Fatou Diop" />);
    const bouton = screen.getByRole('button', { name: 'Actions pour Fatou Diop' });
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(bouton);
    expect(bouton).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(bouton);
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
  });

  it('aligne la liste à droite avec alignement « droite »', async () => {
    render(<MenuActions actions={actions()} variante="icone" alignement="droite" libelle="Actions" />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(liste()).toHaveClass('menu-actions-liste', 'menu-actions-liste--droite');
  });
});

describe('MenuActions — actions danger, séparées et désactivées', () => {
  it('met en rouge l’action danger et isole l’action séparée', async () => {
    render(<MenuActions actions={actions({ supprimer: { danger: true, separee: true } })} />);
    await userEvent.click(screen.getByRole('button', { name: /Plus d’actions/ }));
    const supprimer = screen.getByRole('button', { name: 'Supprimer' });
    expect(supprimer).toHaveClass('menu-actions-danger');
    expect(supprimer.closest('li')).toHaveClass('menu-actions-separee');
    const exporter = screen.getByRole('button', { name: 'Exporter' });
    expect(exporter).not.toHaveClass('menu-actions-danger');
    expect(exporter.closest('li')).not.toHaveClass('menu-actions-separee');
  });

  it('n’exécute pas une action désactivée', async () => {
    const liste3 = actions({ exporter: { desactive: true } });
    render(<MenuActions actions={liste3} />);
    await userEvent.click(screen.getByRole('button', { name: /Plus d’actions/ }));
    const exporter = screen.getByRole('button', { name: 'Exporter' });
    expect(exporter).toBeDisabled();
    await userEvent.click(exporter);
    expect(liste3[0].onClick).not.toHaveBeenCalled();
  });
});

describe('MenuActions — fermeture', () => {
  it('Échap referme la liste et rend le focus au bouton', async () => {
    render(<MenuActions actions={actions()} variante="icone" libelle="Actions pour Fatou Diop" />);
    const bouton = screen.getByRole('button', { name: 'Actions pour Fatou Diop' });
    await userEvent.click(bouton);
    screen.getByRole('button', { name: 'Exporter' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    expect(bouton).toHaveFocus();
  });

  it('un clic à l’extérieur referme la liste', async () => {
    render(
      <>
        <MenuActions actions={actions()} />
        <p>Ailleurs</p>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Plus d’actions/ }));
    await userEvent.click(screen.getByText('Ailleurs'));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('MenuActions — focus après le choix d’une action', () => {
  it('rend le focus au bouton avant d’exécuter l’action (une confirmation y reviendra)', async () => {
    let focusPendantAction: Element | null = null;
    const liste3 = actions({ exporter: { onClick: () => (focusPendantAction = document.activeElement) } });
    render(<MenuActions actions={liste3} variante="icone" libelle="Actions pour Awa Sarr" />);
    const bouton = screen.getByRole('button', { name: 'Actions pour Awa Sarr' });
    await userEvent.click(bouton);
    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }));
    expect(focusPendantAction).toBe(bouton);
    expect(bouton).toHaveFocus();
  });
});
