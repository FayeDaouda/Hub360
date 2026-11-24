import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ElementAgenda } from '@/lib/agenda';
import { elementsDuJour, VueMoisJour } from './vue-mois-jour';

const el = (e: Partial<ElementAgenda> & Pick<ElementAgenda, 'id' | 'type' | 'jour'>): ElementAgenda =>
  ({
    titre: e.id,
    debut: null,
    fin: null,
    lieu: null,
    detail: null,
    organisateur: null,
    invites: [],
    serieId: null,
    lienVisio: null,
    maReponse: null,
    ...e,
  }) as ElementAgenda;

const J = '2026-11-18';
const ELEMENTS = [
  el({
    id: 'Déjeuner',
    type: 'rendez_vous',
    jour: J,
    debut: `${J}T13:00:00.000Z`,
    fin: `${J}T14:30:00.000Z`,
    lieu: 'Le Lagon',
  }),
  el({ id: 'Plans RDC', type: 'echeance', jour: J, detail: 'Avant-projet' }),
  el({
    id: 'Revue',
    type: 'rendez_vous',
    jour: J,
    debut: `${J}T09:00:00.000Z`,
    fin: `${J}T10:00:00.000Z`,
    invites: ['Awa Diop'],
  }),
];

// Téléphone, « Mois et jour » (18/11/2026).
describe('VueMoisJour', () => {
  it('ordre de la journée : journée entière d’abord, puis par heure', () => {
    expect(elementsDuJour(ELEMENTS, J).map((e) => e.id)).toEqual(['Plans RDC', 'Revue', 'Déjeuner']);
  });

  it('un point par élément sous le jour ; la journée choisie dessous, titrée', async () => {
    const onJour = vi.fn();
    render(
      <VueMoisJour
        du="2026-10-26"
        mois="2026-11"
        jour={J}
        aujourdhui={J}
        elements={ELEMENTS}
        onJour={onJour}
        journee={<div data-testid="grille-du-jour" />}
      />,
    );
    const jour = screen.getByRole('button', { name: /mercredi 18 novembre · 3 éléments/ });
    expect(jour).toHaveAttribute('aria-pressed', 'true');
    expect(jour).toHaveAttribute('aria-current', 'date');
    expect(jour.querySelectorAll('.agenda-moisjour-points > span')).toHaveLength(3);
    // La journée (23/11/2026) : la grille des heures fournie par la page,
    // sous le titre du jour.
    const journee = screen.getByRole('region', { name: /Mercredi 18 novembre/ });
    expect(within(journee).getByText('Aujourd’hui')).toBeInTheDocument();
    expect(within(journee).getByTestId('grille-du-jour')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^jeudi 19 novembre$/ }));
    expect(onJour).toHaveBeenCalledWith('2026-11-19');
  });
});
