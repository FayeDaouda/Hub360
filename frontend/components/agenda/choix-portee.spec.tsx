import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useChoixPortee, type Portee } from './choix-portee';

// Choix de la portée sur une série (16/11/2026) : un banc minimal qui pose la
// question et affiche la réponse rendue par `demander`.
function Banc() {
  const { demander, fenetre } = useChoixPortee();
  const [reponse, setReponse] = useState<Portee | null | 'en attente'>('en attente');
  return (
    <>
      <button
        type="button"
        onClick={async () => setReponse(await demander('Déplacer un événement récurrent', 'Déplacer'))}
      >
        Demander
      </button>
      <output aria-label="Réponse">{String(reponse)}</output>
      {fenetre}
    </>
  );
}

const ouvrir = async () => {
  render(<Banc />);
  await userEvent.click(screen.getByRole('button', { name: 'Demander' }));
  return screen.findByRole('dialog', { name: /Déplacer un événement récurrent/ });
};
const reponse = () => screen.getByRole('status', { name: 'Réponse' });

describe('useChoixPortee', () => {
  it('propose les trois portées, « Cet événement » cochée par défaut', async () => {
    await ouvrir();
    expect(screen.getByRole('radio', { name: 'Cet événement' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Cet événement et les suivants' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tous les événements' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Déplacer' })).toBeInTheDocument();
  });

  it('valider sans rien changer rend « occurrence » et ferme la fenêtre', async () => {
    await ouvrir();
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    await waitFor(() => expect(reponse()).toHaveTextContent('occurrence'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['Cet événement et les suivants', 'suivantes'],
    ['Tous les événements', 'toutes'],
  ])('« %s » rend « %s »', async (libelle, attendu) => {
    await ouvrir();
    await userEvent.click(screen.getByRole('radio', { name: libelle }));
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    await waitFor(() => expect(reponse()).toHaveTextContent(attendu));
  });

  it('« Retour » rend null, même après avoir choisi une portée', async () => {
    await ouvrir();
    await userEvent.click(screen.getByRole('radio', { name: 'Tous les événements' }));
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));
    await waitFor(() => expect(reponse()).toHaveTextContent('null'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fermer la fenêtre par la croix rend null', async () => {
    await ouvrir();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(reponse()).toHaveTextContent('null'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fermer la fenêtre par Échap rend null', async () => {
    // Une première réponse, pour voir la seconde la remplacer.
    await ouvrir();
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    await waitFor(() => expect(reponse()).toHaveTextContent('occurrence'));

    await userEvent.click(screen.getByRole('button', { name: 'Demander' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(reponse()).toHaveTextContent('null'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('une nouvelle question repart de « Cet événement »', async () => {
    await ouvrir();
    await userEvent.click(screen.getByRole('radio', { name: 'Tous les événements' }));
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));
    await userEvent.click(screen.getByRole('button', { name: 'Demander' }));
    await screen.findByRole('dialog');
    expect(screen.getByRole('radio', { name: 'Cet événement' })).toBeChecked();
  });
});
