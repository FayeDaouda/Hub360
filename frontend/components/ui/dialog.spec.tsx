import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CloseButton, Drawer, Modal, ModalHeader } from './dialog';

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <Modal onClose={onClose} labelledBy="titre" {...props}>
      <ModalHeader title="Titre" titleId="titre" onClose={onClose} />
      <button type="button">Action</button>
    </Modal>,
  );
  return { onClose, ...utils };
}

describe('Modal', () => {
  it('rend les classes d’avant la structuration et le titre accessible', () => {
    const { container } = renderModal({ backdropClassName: 'modal-backdrop--feuille', className: 'modal--sm' });
    expect(container.firstChild).toHaveClass('modal-backdrop', 'modal-backdrop--feuille');
    const dialog = screen.getByRole('dialog', { name: 'Titre' });
    expect(dialog).toHaveClass('modal', 'modal--sm');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('se ferme au clic sur le fond, pas au clic dans la boîte', async () => {
    const { onClose, container } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Action' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('se ferme avec Échap, sauf si la fenêtre ne le prévoit pas', async () => {
    const { onClose, unmount } = renderModal();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    const sansEchap = renderModal({ closeOnEscape: false });
    await userEvent.keyboard('{Escape}');
    expect(sansEchap.onClose).not.toHaveBeenCalled();
  });

  it('pendant un envoi, ni le fond ni Échap ne ferment', async () => {
    const { onClose, container } = renderModal({ busy: true });
    await userEvent.keyboard('{Escape}');
    await userEvent.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('se rend dans document.body avec `portal`', () => {
    const { container } = renderModal({ portal: true });
    expect(container).toBeEmptyDOMElement();
    expect(document.body).toContainElement(screen.getByRole('dialog'));
  });

  it('transmet le clavier propre à la fenêtre', async () => {
    const onKeyDown = vi.fn();
    renderModal({ onKeyDown });
    screen.getByRole('button', { name: 'Action' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onKeyDown).toHaveBeenCalled();
  });
});

describe('Drawer', () => {
  it('rend le tiroir latéral (`aside` au besoin)', () => {
    const { container } = render(
      <Drawer onClose={() => {}} as="aside" className="offre" label="Offre">
        contenu
      </Drawer>,
    );
    expect(container.firstChild).toHaveClass('fiche-crm-fond');
    const dialog = screen.getByRole('dialog', { name: 'Offre' });
    expect(dialog.tagName).toBe('ASIDE');
    expect(dialog).toHaveClass('fiche-crm', 'offre');
  });
});

describe('CloseButton', () => {
  it('« Fermer », désactivable', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<CloseButton onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<CloseButton onClick={onClick} disabled />);
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDisabled();
  });
});

// Accessibilité : état constaté du composant commun (lot dédié, feuille de
// route). Ces tests décrivent le comportement actuel ; le lot les inversera.
describe('Modal — accessibilité, état actuel', () => {
  it('ne garde pas le focus dans la fenêtre (tabulation non piégée)', async () => {
    render(
      <>
        <button type="button">Dehors</button>
        <Modal onClose={() => {}} label="Fenêtre">
          <button type="button">Dedans</button>
        </Modal>
      </>,
    );
    screen.getByRole('button', { name: 'Dedans' }).focus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Dedans' })).not.toHaveFocus();
  });

  it('ne rend pas le focus au bouton d’origine à la fermeture', async () => {
    const { rerender } = render(<button type="button">Ouvrir</button>);
    const ouvrir = screen.getByRole('button', { name: 'Ouvrir' });
    ouvrir.focus();
    rerender(
      <>
        <button type="button">Ouvrir</button>
        <Modal onClose={() => {}} label="Fenêtre">
          <button type="button">Dedans</button>
        </Modal>
      </>,
    );
    screen.getByRole('button', { name: 'Dedans' }).focus();
    rerender(<button type="button">Ouvrir</button>);
    expect(ouvrir).not.toHaveFocus();
  });
});
