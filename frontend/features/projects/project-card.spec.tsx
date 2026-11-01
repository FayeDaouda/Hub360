import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cardFixture, taskFixture } from './fixtures';
import { ProjectCardView } from './project-card';

// Coches des lignes et personnalisation du projet (01/11/2026).
describe('ProjectCardView', () => {
  const card = cardFixture({
    taches: [
      taskFixture({ id: 'a', libelle: 'Plan masse', etat: { code: 'validee', ecart: null } }),
      taskFixture({ id: 'b', libelle: 'Façades', cle: 'p_facades', ajouteeAuProjet: true }),
    ],
  });
  const base = { card, taskId: null, threadActive: false, onTask: vi.fn(), onThread: vi.fn() };

  it('une coche par ligne, accomplie quand elle est validée ; compteur et ligne ajoutée au projet', () => {
    render(<ProjectCardView {...base} />);
    expect(screen.getByRole('img', { name: 'Accomplie' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Pas encore accomplie' })).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('ajoutée au projet')).toBeTruthy();
  });

  it('en personnalisation : modifier, retirer, ajouter une ligne', async () => {
    const customize = { onAdd: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn() };
    render(<ProjectCardView {...base} customize={customize} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retirer la ligne Façades' }));
    await userEvent.click(screen.getByRole('button', { name: 'Modifier la ligne Plan masse' }));
    await userEvent.click(screen.getByRole('button', { name: /Ajouter une ligne/ }));
    expect(customize.onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    expect(customize.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(customize.onAdd).toHaveBeenCalled();
  });
});
