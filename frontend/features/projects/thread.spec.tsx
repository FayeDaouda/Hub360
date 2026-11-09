import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadView } from './thread';

const api = vi.hoisted(() => ({ getThread: vi.fn(), postComment: vi.fn(), resolveComment: vi.fn() }));
vi.mock('./api', () => api);

const people = [
  { id: 'me', nom: 'Dave Gaye' },
  { id: 'U1', nom: 'Awa Diop' },
  { id: 'U2', nom: 'Bineta Sow' },
];

// Fil de projet (09/11/2026) : « @ » propose les noms ; chaque personne
// citée part avec le commentaire.
describe('ThreadView · mentions', () => {
  beforeEach(() => {
    api.getThread.mockReset().mockResolvedValue([]);
    api.postComment.mockReset().mockResolvedValue({ id: 'C1' });
  });

  it('cite deux personnes par « @ » : les deux partent, jamais soi-même', async () => {
    render(
      <ThreadView
        slug="gc"
        projectId="P1"
        cardId="K1"
        meId="me"
        mentionable={people}
        onUpdate={() => Promise.resolve()}
      />,
    );
    const field = await screen.findByRole('combobox', { name: 'Écrire un commentaire' });
    await userEvent.type(field, 'Voir @da');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.type(field, '{Backspace}{Backspace}aw{Enter}et @bin{Enter}svp');
    await userEvent.click(screen.getByRole('button', { name: 'Publier' }));
    expect(api.postComment).toHaveBeenCalledWith('gc', 'P1', {
      carteId: 'K1',
      texte: 'Voir @Awa Diop et @Bineta Sow svp',
      mentionIds: ['U1', 'U2'],
      parentId: undefined,
    });
  });

  it('affiche les mentions surlignées, et à part celles que le texte ne cite pas', async () => {
    api.getThread.mockResolvedValue([
      {
        id: 'C1',
        texte: 'Merci @Awa Diop',
        le: '2026-11-09T10:00:00Z',
        resoluLe: null,
        auteur: { id: 'U2', nom: 'Bineta Sow' },
        mentions: [
          { id: 'U1', nom: 'Awa Diop' },
          { id: 'me', nom: 'Dave Gaye' },
        ],
        ouvert: true,
        reponses: [],
      },
    ]);
    const { container } = render(
      <ThreadView
        slug="gc"
        projectId="P1"
        cardId="K1"
        meId="me"
        mentionable={null}
        onUpdate={() => Promise.resolve()}
      />,
    );
    expect(await screen.findByText('@Awa Diop')).toHaveClass('pchat-mention');
    expect(container.querySelector('.po-fil-mention')?.textContent?.trim()).toBe('@Dave Gaye');
  });
});
