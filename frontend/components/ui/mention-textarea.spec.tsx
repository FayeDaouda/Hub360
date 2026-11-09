import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MentionText, MentionTextarea, mentionIdsIn, type MentionPerson } from './mention-textarea';

const people: MentionPerson[] = [
  { id: 'U1', nom: 'Awa Diop' },
  { id: 'U2', nom: 'Awa Diop Ndiaye' },
  { id: 'U3', nom: 'Élodie Gaye' },
  { id: 'U4', nom: 'Abdoulaye Mbaye' },
];

function Harness() {
  const [value, setValue] = useState('');
  return (
    <>
      <MentionTextarea value={value} onChange={setValue} people={people} ariaLabel="Commentaire" />
      <output>{value}</output>
    </>
  );
}

describe('mentionIdsIn', () => {
  it('chaque « @Nom complet » cité, une fois, le nom le plus long d’abord', () => {
    expect(mentionIdsIn('Merci @Awa Diop Ndiaye et @Élodie Gaye, @Élodie Gaye encore', people)).toEqual(['U2', 'U3']);
    expect(mentionIdsIn('Voir @Awa Diop.', people)).toEqual(['U1']);
    expect(mentionIdsIn('@Awa Diopette ou awa diop sans @', people)).toEqual([]);
  });

  it('homonymes : la personne choisie dans la liste ; un nom ambigu tapé à la main ne cite personne', () => {
    const twins = [...people, { id: 'U5', nom: 'Awa Diop' }];
    expect(mentionIdsIn('Voir @Awa Diop', twins)).toEqual([]);
    expect(mentionIdsIn('Voir @Awa Diop', twins, [{ id: 'U5', nom: 'Awa Diop' }])).toEqual(['U5']);
    // Choisie puis effacée du texte : ne prévient plus.
    expect(mentionIdsIn('Voir plus tard', twins, [{ id: 'U5', nom: 'Awa Diop' }])).toEqual([]);
    // Un nom choisi plus court ne masque pas un nom plus long tapé à la main.
    expect(mentionIdsIn('@Awa Diop Ndiaye et @Awa Diop', people, [people[0]])).toEqual(['U2', 'U1']);
  });
});

describe('MentionTextarea', () => {
  it('« @ » propose les noms, la liste se resserre à chaque lettre (accents ignorés), Entrée insère le nom', async () => {
    render(<Harness />);
    const field = screen.getByRole('combobox', { name: 'Commentaire' });
    await userEvent.type(field, 'Bonjour @');
    expect(screen.getAllByRole('option')).toHaveLength(4);
    await userEvent.type(field, 'elo');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['ÉGÉlodie Gaye']);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('Bonjour @Élodie Gaye');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('nom en plusieurs mots (« @Awa Diop N »), flèches, puis un autre nom dans le même texte', async () => {
    render(<Harness />);
    const field = screen.getByRole('combobox', { name: 'Commentaire' });
    await userEvent.type(field, '@Awa Diop N');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await userEvent.keyboard('{Tab}');
    await userEvent.type(field, 'et @ab');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('@Awa Diop Ndiaye et @Abdoulaye Mbaye');
  });

  it('Échap ferme la liste ; un mot sans nom correspondant ne propose rien', async () => {
    render(<Harness />);
    const field = screen.getByRole('combobox', { name: 'Commentaire' });
    await userEvent.type(field, '@a');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.type(field, ' puis @zz');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('un clic choisit la personne', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Commentaire' }), '@mb');
    await userEvent.click(screen.getByRole('option', { name: /Abdoulaye Mbaye/ }));
    expect(screen.getByRole('status')).toHaveTextContent('@Abdoulaye Mbaye');
  });

  it('curseur ramené hors du « @… » : la liste se ferme, Entrée reste un retour à la ligne', async () => {
    render(<Harness />);
    const field = screen.getByRole('combobox', { name: 'Commentaire' });
    await userEvent.type(field, 'Bonjour @aw');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Home}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('MentionText', () => {
  it('surligne chaque mention, la sienne davantage', () => {
    const { container } = render(
      <MentionText text="Merci @Awa Diop et @Élodie Gaye" mentions={[people[0], people[2]]} meId="U3" />,
    );
    const marks = [...container.querySelectorAll('.pchat-mention')].map((m) => m.textContent);
    expect(marks).toEqual(['@Awa Diop', '@Élodie Gaye']);
    expect(container.querySelector('.pchat-mention.is-moi')?.textContent).toBe('@Élodie Gaye');
  });
});
