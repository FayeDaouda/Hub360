import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ElementAgenda } from '@/lib/agenda';
import { defilementInitial, GrilleHoraire, largeurBloc } from './grille-horaire';

const J = '2026-11-12';
const el = (e: Partial<ElementAgenda> & Pick<ElementAgenda, 'id' | 'type'>): ElementAgenda => ({
  titre: e.id,
  jour: J,
  debut: null,
  fin: null,
  lieu: null,
  detail: null,
  organisateur: null,
  invites: [],
  annulable: false,
  modifiable: false,
  entretien: false,
  jeSuisOrganisateur: true,
  serieId: null,
  occurrence: null,
  regle: null,
  regleTexte: null,
  occurrenceModifiee: false,
  serie: null,
  lienVisio: null,
  rappelMinutes: null,
  maReponse: null,
  participants: [],
  description: null,
  inviteIds: [],
  ...e,
});
const ELEMENTS = [
  el({
    id: 'Point chantier',
    type: 'rendez_vous',
    debut: `${J}T09:00:00.000Z`,
    fin: `${J}T10:00:00.000Z`,
    lieu: 'Plateau',
  }),
  el({ id: 'Plans RDC', type: 'echeance' }),
];

// Grille horaire de l'Agenda (12/11/2026).
describe('GrilleHoraire', () => {
  const monter = (peutCreer = true) => {
    const props = { onCreneau: vi.fn(), onOuvrir: vi.fn(), onJour: vi.fn() };
    const r = render(
      <GrilleHoraire jours={[J]} aujourdhui="2026-11-20" elements={ELEMENTS} peutCreer={peutCreer} {...props} />,
    );
    return { ...props, ...r };
  };

  it('le rendez-vous à son heure, l’échéance dans le bandeau « Journée » ; un clic ouvre la fiche', () => {
    const { onOuvrir, container } = monter();
    const bloc = screen.getByRole('button', { name: /Point chantier/ });
    // 9 h × 48 px (+1 px d'écart), 1 h − 2 px.
    expect(bloc).toHaveStyle({ top: '433px', height: '46px' });
    expect(bloc).toHaveTextContent('09:00 – 10:00');
    // Le lieu dans son nom accessible ; à l'écran seulement à partir d'1 h 15.
    expect(bloc).toHaveAccessibleName(/Plateau/);
    expect(bloc).not.toHaveTextContent('Plateau');
    expect(container.querySelector('.agenda-grille-journee')).toHaveTextContent('Plans RDC');
    fireEvent.click(bloc);
    expect(onOuvrir).toHaveBeenCalledWith(ELEMENTS[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Plans RDC' }));
    expect(onOuvrir).toHaveBeenLastCalledWith(ELEMENTS[1]);
  });

  it('un créneau vide cliqué propose la demi-heure, pour une heure', () => {
    const { onCreneau, container } = monter();
    fireEvent.click(container.querySelector('.agenda-grille-colonne')!, { clientY: 14.75 * 48 });
    expect(onCreneau).toHaveBeenCalledWith(J, '14:30', '15:30');
  });

  it('sans le droit de créer, cliquer un créneau ne fait rien', () => {
    const { onCreneau, container } = monter(false);
    fireEvent.click(container.querySelector('.agenda-grille-colonne')!, { clientY: 600 });
    expect(onCreneau).not.toHaveBeenCalled();
  });

  it('une réunion qui passe minuit se voit aussi le lendemain, jusqu’à son heure de fin', () => {
    const nuit = el({
      id: 'Astreinte',
      type: 'rendez_vous',
      debut: `${J}T23:00:00.000Z`,
      fin: '2026-11-13T01:00:00.000Z',
    });
    const { container } = render(
      <GrilleHoraire
        jours={[J, '2026-11-13']}
        aujourdhui="2026-11-20"
        elements={[nuit]}
        peutCreer={false}
        onCreneau={vi.fn()}
        onOuvrir={vi.fn()}
      />,
    );
    const [veille, lendemain] = container.querySelectorAll('.agenda-grille-colonne');
    expect(veille.querySelector('.agenda-bloc')).toHaveStyle({ top: `${23 * 48 + 1}px` });
    expect(lendemain.querySelector('.agenda-bloc')).toHaveStyle({ top: '1px', height: `${48 - 2}px` });
  });

  it('court (moins de 40 min) : une ligne « Titre, 15:30 » ; long : le lieu en plus', () => {
    const { container } = render(
      <GrilleHoraire
        jours={[J]}
        aujourdhui="2026-11-20"
        elements={[
          el({ id: 'Appel', type: 'rendez_vous', debut: `${J}T15:30:00.000Z`, fin: `${J}T16:00:00.000Z` }),
          el({
            id: 'Atelier',
            type: 'rendez_vous',
            debut: `${J}T09:00:00.000Z`,
            fin: `${J}T11:00:00.000Z`,
            lieu: 'Studio',
          }),
        ]}
        peutCreer={false}
        onCreneau={vi.fn()}
        onOuvrir={vi.fn()}
      />,
    );
    const [atelier, appel] = [...container.querySelectorAll('.agenda-bloc')];
    expect(appel).toHaveClass('is-court');
    expect(appel).toHaveTextContent('Appel, 15:30');
    expect(atelier).toHaveClass('is-long');
    expect(atelier).toHaveTextContent('09:00 – 11:00Studio');
  });

  it('les jours du week-end et aujourd’hui sont marqués ; les jours passés aussi', () => {
    const { container } = render(
      <GrilleHoraire
        jours={['2026-11-20', '2026-11-21', '2026-11-22']}
        aujourdhui="2026-11-21"
        elements={[]}
        peutCreer={false}
        onCreneau={vi.fn()}
        onOuvrir={vi.fn()}
      />,
    );
    const [ven, sam, dim] = container.querySelectorAll('.agenda-grille-jour');
    expect(ven).toHaveClass('is-passe');
    expect(sam).toHaveClass('is-aujourdhui', 'is-weekend');
    expect(sam).toHaveAttribute('aria-current', 'date');
    expect(dim).toHaveClass('is-weekend');
    expect(dim).not.toHaveClass('is-passe');
    // L'heure actuelle dans la gouttière, la ligne sur chaque jour affiché.
    expect(container.querySelector('.agenda-grille-heure-actuelle')).toBeInTheDocument();
    expect(container.querySelectorAll('.agenda-grille-maintenant')).toHaveLength(3);
    expect(container.querySelectorAll('.agenda-grille-maintenant.is-autre-jour')).toHaveLength(2);
  });

  describe('chevauchements et premier défilement', () => {
    it('chaque bloc déborde sur la colonne suivante, le dernier garde sa part', () => {
      expect(largeurBloc(0, 1)).toEqual({ gauche: 0, largeur: 100 });
      expect(largeurBloc(0, 2)).toEqual({ gauche: 0, largeur: 85 });
      expect(largeurBloc(1, 2)).toEqual({ gauche: 50, largeur: 50 });
      const [a, b, c] = [0, 1, 2].map((i) => largeurBloc(i, 3));
      expect(a.largeur).toBeCloseTo(56.67, 1);
      expect(b.gauche).toBeCloseTo(33.33, 1);
      expect(c.gauche + c.largeur).toBeCloseTo(100, 5);
    });

    it('7 h, ou le premier rendez-vous s’il est plus tôt ; l’heure actuelle si elle est hors de vue', () => {
      const visibles = 12 * 60; // 12 heures à l'écran
      expect(defilementInitial(null, null, visibles)).toBe(6.5 * 60);
      expect(defilementInitial(9 * 60, null, visibles)).toBe(6.5 * 60);
      expect(defilementInitial(5 * 60, null, visibles)).toBe(4.5 * 60);
      // Aujourd'hui, 10 h : déjà dans la vue, on garde 6 h 30.
      expect(defilementInitial(null, 10 * 60, visibles)).toBe(6.5 * 60);
      // 21 h : hors de vue, au tiers de la hauteur.
      expect(defilementInitial(null, 21 * 60, visibles)).toBe(21 * 60 - 4 * 60);
      // Jamais avant minuit.
      expect(defilementInitial(0, null, visibles)).toBe(0);
    });
  });

  // Glisser-déplacer (12/11/2026).
  describe('glisser', () => {
    const monterGlisser = (modifiable: boolean) => {
      const props = { onCreneau: vi.fn(), onOuvrir: vi.fn(), onDeplacer: vi.fn() };
      render(
        <GrilleHoraire
          jours={[J]}
          aujourdhui="2026-11-20"
          elements={[{ ...ELEMENTS[0], modifiable }]}
          peutCreer
          {...props}
        />,
      );
      return { ...props, bloc: screen.getByRole('button', { name: /Point chantier/ }) };
    };

    it('glisser d’une heure vers le bas : déplacé, sans ouvrir la fiche', () => {
      const { bloc, onDeplacer, onOuvrir } = monterGlisser(true);
      fireEvent.pointerDown(bloc, { button: 0, pointerType: 'mouse', clientX: 10, clientY: 100 });
      fireEvent.pointerMove(bloc, { pointerType: 'mouse', buttons: 1, clientX: 10, clientY: 148 });
      fireEvent.pointerUp(bloc, { pointerType: 'mouse', clientX: 10, clientY: 148 });
      fireEvent.click(bloc);
      expect(onDeplacer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'Point chantier' }),
        `${J}T10:00:00.000Z`,
        `${J}T11:00:00.000Z`,
      );
      expect(onOuvrir).not.toHaveBeenCalled();
    });

    it('tirer la poignée : la fin s’allonge d’une demi-heure', () => {
      const { bloc, onDeplacer } = monterGlisser(true);
      const poignee = bloc.querySelector('.agenda-bloc-poignee')!;
      fireEvent.pointerDown(poignee, { button: 0, pointerType: 'mouse', clientX: 10, clientY: 100 });
      fireEvent.pointerMove(bloc, { pointerType: 'mouse', buttons: 1, clientX: 10, clientY: 124 });
      fireEvent.pointerUp(bloc, { pointerType: 'mouse' });
      expect(onDeplacer).toHaveBeenCalledWith(expect.anything(), `${J}T09:00:00.000Z`, `${J}T10:30:00.000Z`);
    });

    it('un simple clic ouvre la fiche ; un rendez-vous d’un autre ne se glisse pas', () => {
      const a = monterGlisser(true);
      fireEvent.pointerDown(a.bloc, { button: 0, pointerType: 'mouse', clientX: 10, clientY: 100 });
      fireEvent.pointerUp(a.bloc, { pointerType: 'mouse' });
      fireEvent.click(a.bloc);
      expect(a.onOuvrir).toHaveBeenCalled();
      expect(a.onDeplacer).not.toHaveBeenCalled();
      a.bloc.ownerDocument.body.innerHTML = '';
      const b = monterGlisser(false);
      expect(b.bloc.querySelector('.agenda-bloc-poignee')).toBeNull();
      fireEvent.pointerDown(b.bloc, { button: 0, pointerType: 'mouse', clientX: 10, clientY: 100 });
      fireEvent.pointerMove(b.bloc, { pointerType: 'mouse', buttons: 1, clientX: 10, clientY: 200 });
      fireEvent.pointerUp(b.bloc, { pointerType: 'mouse' });
      expect(b.onDeplacer).not.toHaveBeenCalled();
    });

    it('Semaine : glissé vers la colonne du lendemain, le pointeur reste suivi jusqu’au bout', () => {
      const props = { onCreneau: vi.fn(), onOuvrir: vi.fn(), onDeplacer: vi.fn() };
      const { container } = render(
        <GrilleHoraire
          jours={[J, '2026-11-13']}
          aujourdhui="2026-11-20"
          elements={[{ ...ELEMENTS[0], modifiable: true }]}
          peutCreer
          {...props}
        />,
      );
      container.querySelectorAll('.agenda-grille-colonne').forEach((c, i) => {
        c.getBoundingClientRect = () => ({ left: i * 100, right: (i + 1) * 100, top: 0, bottom: 1152 }) as DOMRect;
      });
      const corps = container.querySelector('.agenda-grille-corps')!;
      const bloc = screen.getByRole('button', { name: /Point chantier/ });
      fireEvent.pointerDown(bloc, { button: 0, pointerType: 'mouse', clientX: 50, clientY: 100 });
      fireEvent.pointerMove(bloc, { pointerType: 'mouse', buttons: 1, clientX: 150, clientY: 100 });
      // Le bloc a changé de colonne : la suite arrive au corps de la grille.
      fireEvent.pointerUp(corps, { pointerType: 'mouse', clientX: 150, clientY: 100 });
      expect(props.onDeplacer).toHaveBeenCalledWith(
        expect.anything(),
        '2026-11-13T09:00:00.000Z',
        '2026-11-13T10:00:00.000Z',
      );
    });

    it('Échap abandonne le glisser', () => {
      const { bloc, onDeplacer } = monterGlisser(true);
      fireEvent.pointerDown(bloc, { button: 0, pointerType: 'mouse', clientX: 10, clientY: 100 });
      fireEvent.pointerMove(bloc, { pointerType: 'mouse', buttons: 1, clientX: 10, clientY: 196 });
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.pointerUp(bloc, { pointerType: 'mouse' });
      expect(onDeplacer).not.toHaveBeenCalled();
    });
  });
  // Lot B3 (12/11/2026) : une réunion déclinée reste visible, effacée.
  describe('réunion déclinée', () => {
    const reunion = (x: Partial<ElementAgenda>) =>
      el({
        id: 'Revue',
        type: 'rendez_vous',
        debut: `${J}T09:00:00.000Z`,
        fin: `${J}T10:00:00.000Z`,
        jeSuisOrganisateur: false,
        ...x,
      });
    const rendre = (e: ElementAgenda) => {
      render(
        <GrilleHoraire
          jours={[J]}
          aujourdhui="2026-11-20"
          elements={[e]}
          peutCreer
          onCreneau={vi.fn()}
          onOuvrir={vi.fn()}
          onJour={vi.fn()}
        />,
      );
      return screen.getByRole('button', { name: /Revue/ });
    };

    it('déclinée (« Non ») : le bloc est marqué effacé, mais reste là et s’ouvre', () => {
      const bloc = rendre(reunion({ maReponse: 'non' }));
      expect(bloc).toHaveClass('is-decline');
      expect(bloc).toHaveTextContent('09:00 – 10:00');
    });

    it.each([
      ['acceptée', 'oui' as const],
      ['en suspens', 'peut_etre' as const],
      ['sans réponse', null],
    ])('%s : le bloc n’est pas effacé', (_cas, maReponse) => {
      expect(rendre(reunion({ maReponse }))).not.toHaveClass('is-decline');
    });

    it('déclinée par un collègue dont l’agenda est superposé : pas effacée (ce n’est pas sa réponse)', () => {
      const bloc = rendre(reunion({ maReponse: 'non', calque: { id: 'U3', nom: 'Fatou Ba', couleur: 'azur' } }));
      expect(bloc).not.toHaveClass('is-decline');
    });
  });
});
