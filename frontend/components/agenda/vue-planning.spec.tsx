import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElementAgenda } from '@/lib/agenda';
import { VuePlanning } from './vue-planning';

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

const DU = '2026-11-23';
const CONGE = el({ id: 'c1:2026-11-23', type: 'conge', titre: 'Congé payé', jour: DU });
// Heures en UTC : l'heure de Dakar affichée par l'application.
const REVUE = el({
  id: 'r1',
  type: 'rendez_vous',
  titre: 'Revue',
  jour: DU,
  debut: `${DU}T09:00:00.000Z`,
  fin: `${DU}T10:00:00.000Z`,
  lieu: 'Le Lagon',
});
const POINT = el({
  id: 'r2',
  type: 'rendez_vous',
  titre: 'Point client',
  jour: '2026-11-24',
  debut: '2026-11-24T14:00:00.000Z',
  fin: '2026-11-24T15:30:00.000Z',
  invites: ['Awa Diop', 'Dior Sourang'],
});
const DEMANDE = el({
  id: 'd1:2026-11-26',
  type: 'demande',
  titre: 'Absence · Awa Diop',
  jour: '2026-11-26',
  demande: { id: 'd1', type: 'conge_paye', jours: 3, validationFinale: false },
});
const AVANT = el({ id: 'Avant la période', type: 'echeance', jour: '2026-11-20' });
const ELEMENTS = [POINT, DEMANDE, AVANT, REVUE, CONGE];

const rendre = (props: Partial<Parameters<typeof VuePlanning>[0]> = {}) => {
  const p = {
    du: DU,
    aujourdhui: DU,
    elements: ELEMENTS,
    peutCreer: true,
    onOuvrir: vi.fn(),
    onCreer: vi.fn(),
    ...props,
  };
  render(<VuePlanning {...p} />);
  return p;
};

// Horloge figée (« passé » se calcule sur l'heure courante).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-23T08:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('VuePlanning', () => {
  it('liste une ligne par élément, groupée par jour, sans bouton d’action', () => {
    rendre();
    expect(screen.getAllByRole('group').map((r) => r.querySelector('h3')?.textContent)).toEqual([
      'lundi 23 novembre',
      'mardi 24 novembre',
      'jeudi 26 novembre',
    ]);
    // Une ligne = un bouton ; rien d'autre (ni modifier, ni annuler, ni décider).
    expect(screen.getAllByRole('button')).toHaveLength(4);
    const lundi = screen.getByRole('group', { name: 'lundi 23 novembre' });
    expect(
      within(lundi)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Toute la journéeCongé payé', '09:00 – 10:00RevueLe Lagon']);
  });

  it('ignore les jours avant le début de la période', () => {
    rendre();
    expect(screen.queryByText('Avant la période')).toBeNull();
    expect(screen.queryByRole('group', { name: 'vendredi 20 novembre' })).toBeNull();
  });

  it('affiche « Toute la journée » pour un congé et l’heure de Dakar pour un rendez-vous', () => {
    rendre();
    const lundi = screen.getByRole('group', { name: 'lundi 23 novembre' });
    const conge = within(lundi).getByRole('button', { name: /Congé payé/ });
    expect(within(conge).getByText('Toute la journée')).toBeInTheDocument();
    const point = screen.getByRole('button', { name: /Point client/ });
    expect(within(point).getByText('14:00 – 15:30')).toBeInTheDocument();
  });

  it('montre sous le titre le lieu, sinon les invités, et pour une demande d’absence son type, sa durée et « à décider »', () => {
    rendre();
    expect(within(screen.getByRole('button', { name: /Revue/ })).getByText('Le Lagon')).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: /Point client/ })).getByText('Avec Awa Diop, Dior Sourang'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: /Absence · Awa Diop/ })).getByText('Congé payé · 3 j · à décider'),
    ).toBeInTheDocument();
  });

  it('marque le jour d’aujourd’hui', () => {
    rendre();
    expect(screen.getByRole('group', { name: 'lundi 23 novembre' })).toHaveClass('is-aujourdhui');
    expect(screen.getByRole('group', { name: 'mardi 24 novembre' })).not.toHaveClass('is-aujourdhui');
  });

  it('une ligne ouvre la fiche de son élément, avec son ancre', async () => {
    const { onOuvrir } = rendre();
    await userEvent.click(screen.getByRole('button', { name: /Point client/ }));
    expect(onOuvrir).toHaveBeenCalledWith(POINT, { top: 0, left: 0, right: 0, bottom: 0 });
  });

  it('marque l’élément d’un collègue de ses initiales et de son agenda', () => {
    rendre({
      elements: [{ ...POINT, calque: { id: 'U7', nom: 'Dior Sourang', couleur: 'azur' } }],
    });
    const ligne = screen.getByRole('button', { name: /Point client/ });
    expect(within(ligne).getByText('DS')).toBeInTheDocument();
    expect(within(ligne).getByText('Agenda de Dior Sourang')).toBeInTheDocument();
  });

  it('sans rien à venir : le dit et propose de créer un rendez-vous', async () => {
    const { onCreer } = rendre({ elements: [AVANT] });
    expect(screen.getByText('Rien de prévu sur ces 30 jours.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Créer un rendez-vous' }));
    expect(onCreer).toHaveBeenCalledTimes(1);
  });

  it('sans rien à venir et sans le droit de créer : aucun bouton', () => {
    rendre({ elements: [], peutCreer: false });
    expect(screen.getByText('Rien de prévu sur ces 30 jours.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
