import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SaisieChat, TexteMessage } from './saisie-chat';

vi.mock('@/lib/chat', () => ({
  getMentionnables: vi.fn().mockResolvedValue([
    { id: 'U1', nom: 'Abdoulaye Mbaye', photoUrl: null },
    { id: 'U2', nom: 'Awa Diop', photoUrl: null },
  ]),
}));

// Mentions surlignées dans un message (01/11/2026), la sienne davantage.
describe('TexteMessage', () => {
  it('surligne chaque @personne mentionnée', () => {
    const { container } = render(
      <TexteMessage
        texte="Bonjour @Awa Diop et @Moussa Sow, réunion à 10 h"
        mentions={[
          { id: 'U2', nom: 'Awa Diop' },
          { id: 'U3', nom: 'Moussa Sow' },
        ]}
        moiId="U3"
      />,
    );
    const mentions = container.querySelectorAll('.pchat-mention');
    expect([...mentions].map((m) => m.textContent)).toEqual(['@Awa Diop', '@Moussa Sow']);
    expect(container.querySelector('.pchat-mention.is-moi')?.textContent).toBe('@Moussa Sow');
    expect(container.textContent).toBe('Bonjour @Awa Diop et @Moussa Sow, réunion à 10 h');
  });
});

// Saisie : « @ » propose les lecteurs de la conversation ; la mention choisie
// part avec le message, même si l'on tape vite juste après.
describe('SaisieChat', () => {
  it('@Ab → Entrée choisit la personne ; le texte suit, la mention part avec le message', async () => {
    const onEnvoyer = vi.fn();
    render(<SaisieChat slug="gc" canalId="C1" moiId="U9" envoiEnCours={false} onEnvoyer={onEnvoyer} />);
    const champ = screen.getByRole('textbox', { name: 'Message' });
    await waitFor(() => expect(champ).toBeTruthy());
    await userEvent.type(champ, 'Merci @Ab');
    await screen.findByRole('option', { name: /Abdoulaye Mbaye/ });
    await userEvent.keyboard('{Enter}');
    await userEvent.type(champ, 'c’est noté{Enter}');
    expect(onEnvoyer).toHaveBeenCalledWith('Merci @Abdoulaye Mbaye c’est noté', ['U1']);
  });
});
