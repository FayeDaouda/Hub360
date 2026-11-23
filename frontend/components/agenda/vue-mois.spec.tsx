import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElementAgenda } from '@/lib/agenda';
import { VueMois } from './vue-mois';

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

const REVUE = el({
  id: 'r1',
  type: 'rendez_vous',
  titre: 'Revue chantier',
  jour: '2026-11-18',
  debut: '2026-11-18T09:00:00.000Z',
  fin: '2026-11-18T10:00:00.000Z',
});
// Congé du lundi 23 au mercredi 25 novembre, réparti jour par jour.
const CONGE = ['2026-11-23', '2026-11-24', '2026-11-25'].map((jour) =>
  el({ id: `c1:${jour}`, type: 'conge', titre: 'Congé payé', jour }),
);
const DE_DIOR = el({
  id: 'r2',
  type: 'rendez_vous',
  titre: 'Point client',
  jour: '2026-11-19',
  debut: '2026-11-19T11:00:00.000Z',
  fin: '2026-11-19T12:00:00.000Z',
  calque: { id: 'U7', nom: 'Dior Sourang', couleur: 'azur' },
});
const ELEMENTS = [REVUE, ...CONGE, DE_DIOR];

// Grille de novembre 2026 : 6 semaines du lundi 26 octobre au dimanche 6 décembre.
const DU = '2026-10-26';
const rendre = (props: Partial<Parameters<typeof VueMois>[0]> = {}) => {
  const p = {
    du: DU,
    mois: '2026-11',
    aujourdhui: '2026-11-23',
    elements: ELEMENTS,
    etroit: false,
    peutCreer: true,
    onJour: vi.fn(),
    onOuvrir: vi.fn(),
    onCreer: vi.fn(),
    ...props,
  };
  const { container } = render(<VueMois {...p} />);
  // Le fond de la case d'un jour (semaine s, colonne k du lundi).
  const caseDu = (jour: string) => {
    const i = Math.round((Date.parse(jour) - Date.parse(DU)) / 86_400_000);
    return container.querySelectorAll<HTMLElement>('.agenda-mois-case')[i];
  };
  return { ...p, container, caseDu };
};

// Horloge figée (« passé » se calcule sur l'heure courante).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-23T08:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('VueMois · ordinateur', () => {
  it('affiche les 6 semaines du mois et marque aujourd’hui', () => {
    const { container } = rendre();
    expect(container.querySelectorAll('.agenda-mois-semaine')).toHaveLength(6);
    expect(
      screen.getByRole('button', { name: /^Lundi 23 novembre · 1 élément : afficher la journée$/ }),
    ).toHaveAttribute('aria-current', 'date');
  });

  it('le numéro d’un jour ouvre sa journée', async () => {
    const { onJour } = rendre();
    await userEvent.click(
      screen.getByRole('button', { name: /^Mercredi 18 novembre · 1 élément : afficher la journée$/ }),
    );
    expect(onJour).toHaveBeenCalledWith('2026-11-18');
  });

  it('un élément ouvre sa fiche avec son ancre, sans proposer de création', async () => {
    const { onOuvrir, onCreer } = rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Revue chantier, 09:00' }));
    expect(onOuvrir).toHaveBeenCalledWith(REVUE, { top: 0, left: 0, right: 0, bottom: 0 });
    expect(onCreer).not.toHaveBeenCalled();
  });

  it('un clic dans le vide d’une case propose un rendez-vous ce jour-là', async () => {
    const { onCreer, caseDu } = rendre();
    expect(caseDu('2026-11-26')).toHaveClass('is-creable');
    await userEvent.click(caseDu('2026-11-26'));
    expect(onCreer).toHaveBeenCalledWith('2026-11-26', { top: 0, left: 0, right: 0, bottom: 0 });
  });

  it('un congé sur deux semaines : deux barres, et leur nom dit la suite', () => {
    // Du vendredi 27 novembre au mardi 1er décembre.
    const long = ['2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01'].map((jour) =>
      el({ id: `c2:${jour}`, type: 'conge', titre: 'Congé long', jour }),
    );
    rendre({ elements: long });
    const barres = screen.getAllByRole('button', { name: /Congé long/ });
    expect(barres.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Congé long, du vendredi 27 novembre pendant 3 jours (continue la semaine suivante)',
      'Congé long, du lundi 30 novembre pendant 2 jours (commencé la semaine précédente)',
    ]);
    expect(barres[0]).toHaveClass('is-suite-apres');
    expect(barres[1]).toHaveClass('is-suite-avant');
  });

  it('ne propose aucune création dans une case sans le droit de créer', async () => {
    const { onCreer, caseDu } = rendre({ peutCreer: false });
    expect(caseDu('2026-11-26')).not.toHaveClass('is-creable');
    await userEvent.click(caseDu('2026-11-26'));
    expect(onCreer).not.toHaveBeenCalled();
  });

  it('montre un congé de 3 jours une seule fois, en une barre', () => {
    rendre();
    const barres = screen.getAllByRole('button', { name: /Congé payé/ });
    expect(barres).toHaveLength(1);
    expect(barres[0]).toHaveAccessibleName('Congé payé, du lundi 23 novembre pendant 3 jours');
    expect(barres[0]).toHaveClass('is-journee');
  });

  it('marque l’élément d’un collègue de ses initiales et de son nom', () => {
    rendre();
    const sien = screen.getByRole('button', { name: /Dior Sourang/ });
    expect(sien).toHaveAccessibleName('Dior Sourang : Point client, 11:00');
    expect(within(sien).getByText('DS')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: 'Revue chantier, 09:00' })).queryByText('DS')).toBeNull();
  });

  it('affiche le nom court du mois sur le 1er (« 1 nov. », « 1 déc. »)', () => {
    rendre();
    expect(screen.getByRole('button', { name: /^Dimanche 1 novembre : afficher la journée$/ })).toHaveTextContent(
      /^1 nov\.$/,
    );
    expect(screen.getByRole('button', { name: /^Mardi 1 décembre : afficher la journée$/ })).toHaveTextContent(
      /^1 déc\.$/,
    );
    expect(screen.getByRole('button', { name: /^Mercredi 2 décembre : afficher la journée$/ })).toHaveTextContent(
      /^2$/,
    );
  });
});

describe('VueMois · « + n autres »', () => {
  const J = '2026-11-25';
  const CHARGE = [
    el({ id: 'e1', type: 'echeance', titre: 'Livraison', jour: J }),
    el({ id: 'e2', type: 'echeance', titre: 'Rendu APS', jour: J }),
    ...['09', '11', '15'].map((h) =>
      el({
        id: `r${h}`,
        type: 'rendez_vous',
        titre: `Réunion ${h} h`,
        jour: J,
        debut: `${J}T${h}:00:00.000Z`,
        fin: `${J}T${h}:30:00.000Z`,
      }),
    ),
  ];

  it('avec 3 lignes (jsdom ne mesure rien), 5 éléments un jour : 2 visibles et « + 3 autres »', () => {
    rendre({ elements: CHARGE });
    expect(screen.getByRole('button', { name: 'Livraison, toute la journée' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rendu APS, toute la journée' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Réunion/ })).toBeNull();
    expect(screen.getByRole('button', { name: '3 autres le mercredi 25 novembre' })).toHaveTextContent('+ 3 autres');
  });

  it('n’affiche aucun « + n autres » quand tout tient', () => {
    rendre();
    expect(screen.queryByRole('button', { name: / autres? le / })).toBeNull();
  });

  it('« + 3 autres » ouvre la journée en fenêtre, avec ses 5 éléments', async () => {
    const { onCreer } = rendre({ elements: CHARGE });
    await userEvent.click(screen.getByRole('button', { name: '3 autres le mercredi 25 novembre' }));
    const fenetre = screen.getByRole('dialog', { name: 'Mercredi 25 novembre' });
    const lignes = within(fenetre).getAllByRole('listitem');
    expect(lignes.map((l) => within(l).getByRole('button').getAttribute('aria-label'))).toEqual([
      'Livraison, toute la journée',
      'Rendu APS, toute la journée',
      'Réunion 09 h, 09:00',
      'Réunion 11 h, 11:00',
      'Réunion 15 h, 15:00',
    ]);
    expect(onCreer).not.toHaveBeenCalled();
  });

  it('un élément de la fenêtre la ferme et ouvre sa fiche', async () => {
    const { onOuvrir } = rendre({ elements: CHARGE });
    await userEvent.click(screen.getByRole('button', { name: '3 autres le mercredi 25 novembre' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Réunion 15 h, 15:00' }));
    expect(onOuvrir).toHaveBeenCalledWith(CHARGE[4], { top: 0, left: 0, right: 0, bottom: 0 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('le titre de la journée dans la fenêtre ouvre la vue Jour et ferme la fenêtre', async () => {
    const { onJour } = rendre({ elements: CHARGE });
    await userEvent.click(screen.getByRole('button', { name: '3 autres le mercredi 25 novembre' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mercredi 25 novembre' }));
    expect(onJour).toHaveBeenCalledWith(J);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('VueMois · téléphone (etroit)', () => {
  it('montre des points sous les numéros, sans bouton d’élément', () => {
    rendre({ etroit: true });
    expect(screen.queryByRole('button', { name: 'Revue chantier, 09:00' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Congé payé/ })).toBeNull();
    const numero = screen.getByRole('button', { name: /^Mercredi 18 novembre · 1 élément/ });
    expect(numero.querySelectorAll('.agenda-mois-points > span')).toHaveLength(1);
  });

  it('le numéro d’un jour ouvre sa journée', async () => {
    const { onJour } = rendre({ etroit: true });
    await userEvent.click(screen.getByRole('button', { name: /^Mardi 24 novembre · 1 élément/ }));
    expect(onJour).toHaveBeenCalledWith('2026-11-24');
  });

  it('un clic dans une case ne propose pas de création, même avec le droit', async () => {
    const { onCreer, caseDu } = rendre({ etroit: true, peutCreer: true });
    expect(caseDu('2026-11-26')).not.toHaveClass('is-creable');
    await userEvent.click(caseDu('2026-11-26'));
    expect(onCreer).not.toHaveBeenCalled();
  });
});
