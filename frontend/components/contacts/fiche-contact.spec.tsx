import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FicheContactModal } from './fiche-contact';

const api = vi.hoisted(() => ({ getFicheContact: vi.fn() }));
vi.mock('@/lib/contacts', () => api);
const chat = vi.hoisted(() => ({ ouvrirDirect: vi.fn(), ouvrirConversation: vi.fn() }));
const session = vi.hoisted(() => ({ courante: { permissions: { communication: 'E' } as Record<string, string> } }));
vi.mock('@/lib/layout-contexte', () => ({ useSessionCourante: () => session.courante }));
vi.mock('@/lib/chat', async (original) => ({ ...(await original<typeof import('@/lib/chat')>()), ...chat }));

// Fiche contact (Ctrl+K, messagerie) : la même fiche que l'annuaire (22/11/2026).
describe('FicheContactModal', () => {
  it('la fiche de l’annuaire, « Écrire » et le lien pour l’y retrouver', async () => {
    api.getFicheContact.mockResolvedValue({
      utilisateurId: 'U2',
      prenom: 'Léa',
      nom: 'Ndiaye',
      poste: 'Architecte',
      cellule: 'Conception',
      chef: 'Moussa Sow',
      estChef: false,
      telephone: '+221 77 123 45 67',
      email: 'lea@gc.sn',
      nomAffiche: null,
      photoUrl: null,
    });
    chat.ouvrirDirect.mockResolvedValue({ id: 'C1' });
    const onClose = vi.fn();
    render(<FicheContactModal slug="gc" utilisateurId="U2" onClose={onClose} />);
    expect(await screen.findByRole('dialog', { name: 'Léa Ndiaye' })).toBeInTheDocument();
    expect(screen.getByText(/chef d’équipe : Moussa Sow/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir dans l’annuaire/ })).toHaveAttribute(
      'href',
      '/admin/gc/annuaire?personne=U2',
    );
    expect(screen.getByRole('link', { name: /Appeler/ })).toHaveAttribute('href', 'tel:+221771234567');
    await userEvent.click(screen.getByRole('button', { name: /Écrire/ }));
    expect(chat.ouvrirConversation).toHaveBeenCalledWith('C1');
    expect(onClose).toHaveBeenCalled();
  });

  it('sans le droit d’écrire dans la messagerie : pas de « Écrire » ; le lien vers l’annuaire ferme la fiche', async () => {
    session.courante = { permissions: { communication: 'L' } };
    const onClose = vi.fn();
    render(<FicheContactModal slug="gc" utilisateurId="U2" onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'Léa Ndiaye' });
    expect(screen.queryByRole('button', { name: /Écrire/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /Ouvrir dans l’annuaire/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
