import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmModal } from './confirm-modal';

describe('ConfirmModal', () => {
  it('focus sur « Annuler » pour une action destructrice, sur l’action sinon', () => {
    const { unmount } = render(
      <ConfirmModal title="Supprimer" message="Sûr ?" danger onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
    unmount();
    render(<ConfirmModal title="Envoyer" message="Sûr ?" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Confirmer' })).toHaveFocus();
  });

  it('garde la tabulation dans la boîte et rend le focus à l’origine', async () => {
    const { rerender } = render(<button type="button">Ouvrir</button>);
    const ouvrir = screen.getByRole('button', { name: 'Ouvrir' });
    ouvrir.focus();
    rerender(
      <>
        <button type="button">Ouvrir</button>
        <ConfirmModal title="Envoyer" message="Sûr ?" onConfirm={() => {}} onClose={() => {}} />
      </>,
    );
    // Fermer, Annuler, Confirmer : la tabulation boucle sans sortir.
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Confirmer' })).toHaveFocus();
    rerender(<button type="button">Ouvrir</button>);
    expect(ouvrir).toHaveFocus();
  });

  it('Échap ferme la confirmation sans fermer le tiroir qui l’a ouverte', async () => {
    const onCloseTiroir = vi.fn();
    const onClose = vi.fn();
    function Tiroir() {
      useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseTiroir();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, []);
      return <ConfirmModal title="Envoyer" message="Sûr ?" onConfirm={() => {}} onClose={onClose} onTop />;
    }
    render(<Tiroir />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCloseTiroir).not.toHaveBeenCalled();
  });

  it('un refus garde la fenêtre ouverte et affiche l’erreur', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmModal
        title="Envoyer"
        message="Sûr ?"
        onConfirm={() => Promise.reject(new Error('Déjà envoyée'))}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(screen.getByText('Déjà envoyée')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeEnabled();
  });

  it('action désactivée tant que le formulaire est incomplet', () => {
    render(
      <ConfirmModal
        title="Déposer"
        message="…"
        confirmLabel="Déposer"
        confirmDisabled
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Déposer' })).toBeDisabled();
    expect(screen.getByRole('alertdialog', { name: 'Déposer' })).toBeInTheDocument();
  });
});
