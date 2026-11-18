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

  it('un point par élément sous le jour ; la journée choisie en liste (heures, titre, lieu ou invités)', async () => {
    const onJour = vi.fn();
    const onOuvrir = vi.fn();
    render(
      <VueMoisJour
        du="2026-10-26"
        mois="2026-11"
        jour={J}
        aujourdhui={J}
        elements={ELEMENTS}
        peutCreer
        onJour={onJour}
        onOuvrir={onOuvrir}
        onCreer={vi.fn()}
      />,
    );
    const jour = screen.getByRole('button', { name: /mercredi 18 novembre · 3 éléments/ });
    expect(jour).toHaveAttribute('aria-pressed', 'true');
    expect(jour).toHaveAttribute('aria-current', 'date');
    expect(jour.querySelectorAll('.agenda-moisjour-points > span')).toHaveLength(3);
    const liste = screen.getByRole('region', { name: /Mercredi 18 novembre/ });
    const lignes = within(liste).getAllByRole('button');
    expect(lignes.map((l) => l.textContent)).toEqual([
      'JournéePlans RDCAvant-projet',
      '09:0010:00RevueAvec Awa Diop',
      '13:0014:30DéjeunerLe Lagon',
    ]);
    await userEvent.click(lignes[2]);
    expect(onOuvrir).toHaveBeenCalledWith(ELEMENTS[0], expect.any(Object));
    await userEvent.click(screen.getByRole('button', { name: /^jeudi 19 novembre$/ }));
    expect(onJour).toHaveBeenCalledWith('2026-11-19');
  });

  it('jour vide : le dire, et proposer de créer (si on peut)', async () => {
    const onCreer = vi.fn();
    render(
      <VueMoisJour
        du="2026-10-26"
        mois="2026-11"
        jour="2026-11-19"
        aujourdhui={J}
        elements={ELEMENTS}
        peutCreer
        onJour={vi.fn()}
        onOuvrir={vi.fn()}
        onCreer={onCreer}
      />,
    );
    expect(screen.getByText('Rien de prévu ce jour-là.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Créer un rendez-vous/ }));
    expect(onCreer).toHaveBeenCalledWith('2026-11-19');
  });
});
