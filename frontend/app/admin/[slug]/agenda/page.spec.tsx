import { Suspense } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElementAgenda, SemaineAgenda } from '@/lib/agenda';
import { ApiError } from '@/lib/client-api';
import AgendaPage from './page';

const api = vi.hoisted(() => ({
  getAgenda: vi.fn(),
  getPersonnesAgenda: vi.fn(),
  creerRendezVous: vi.fn(),
  modifierRendezVous: vi.fn(),
  annulerRendezVous: vi.fn(),
  repondreInvitation: vi.fn(),
  getDisponibilites: vi.fn(),
}));
vi.mock('@/lib/agenda', async (original) => ({ ...(await original<typeof import('@/lib/agenda')>()), ...api }));
vi.mock('@/lib/layout-contexte', () => ({ useTitrePage: () => undefined }));
const confirmer = vi.hoisted(() => vi.fn());
vi.mock('@/components/confirmation', () => ({ useConfirmer: () => confirmer }));

// Jeudi 12 novembre 2026, 10 h à Dakar : la semaine va du lundi 9 au dimanche 15.
const MAINTENANT = new Date('2026-11-12T10:00:00.000Z');
const J = '2026-11-12';
const RDV: ElementAgenda = {
  id: 'R1',
  type: 'rendez_vous',
  titre: 'Point chantier',
  jour: J,
  debut: `${J}T09:00:00.000Z`,
  fin: `${J}T10:00:00.000Z`,
  lieu: 'Plateau',
  detail: 'Apporter les plans',
  organisateur: 'Awa Diop',
  invites: ['Moussa Sow'],
  annulable: true,
  modifiable: true,
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
  description: 'Apporter les plans',
  inviteIds: ['U2'],
};
const PERSONNES = [
  { id: 'U2', nom: 'Moussa Sow' },
  { id: 'U3', nom: 'Fatou Ba' },
];
const reponse = (du: string, au: string, x: Partial<SemaineAgenda> = {}): SemaineAgenda => ({
  du,
  au,
  personne: { id: 'U1', nom: 'Awa Diop' },
  elements: [RDV],
  peutVoirAutres: false,
  peutCreer: true,
  peutInviter: true,
  ...x,
});

// `use(params)` suspend le premier rendu : la page vit dans un Suspense, et
// le rendu s'attend (act asynchrone) le temps que les paramètres arrivent.
const monter = () =>
  act(async () => {
    render(
      <Suspense fallback={null}>
        <AgendaPage params={Promise.resolve({ slug: 'gc' })} />
      </Suspense>,
    );
  });

// Page Agenda (12/11/2026) : vues Jour / Semaine / Planning, fiche et modification.
describe('Page Agenda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Horloge figée (Date seule : les attentes de Testing Library restent réelles).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MAINTENANT);
    api.getAgenda.mockImplementation((_slug: string, du: string, au: string) => Promise.resolve(reponse(du, au)));
    api.getPersonnesAgenda.mockResolvedValue(PERSONNES);
    api.modifierRendezVous.mockResolvedValue({ ok: true });
    api.repondreInvitation.mockResolvedValue({ ok: true });
    api.getDisponibilites.mockResolvedValue({ occupes: [], absents: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    // jsdom n'a pas de matchMedia : le retirer après le test « téléphone ».
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  describe('passage de vue', () => {
    it('ouvre la semaine en cours par défaut, en grille horaire', async () => {
      await monter();
      expect(await screen.findByRole('button', { name: /Point chantier/ })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Semaine' })).toBeChecked();
      expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-09', '2026-11-15');
    });

    it('Jour charge la seule journée ; Planning les 30 jours qui viennent, en liste', async () => {
      await monter();
      await screen.findByRole('button', { name: /Point chantier/ });

      await userEvent.click(screen.getByRole('radio', { name: 'Jour' }));
      expect(screen.getByRole('radio', { name: 'Jour' })).toBeChecked();
      await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', J, J));

      await userEvent.click(screen.getByRole('radio', { name: 'Planning' }));
      await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', J, '2026-12-11'));
      // Planning épuré (U4) : une ligne sans bouton ; elle ouvre la fiche, qui
      // porte les actions.
      const ligne = (await screen.findByText('Point chantier')).closest('li')!;
      expect(within(ligne).getAllByRole('button')).toHaveLength(1);
      expect(within(ligne).queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
      await userEvent.click(within(ligne).getByRole('button'));
      const fiche = await screen.findByRole('dialog');
      expect(within(fiche).getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
    });

    it('« Semaine suivante » charge la semaine d’après', async () => {
      await monter();
      await screen.findByRole('button', { name: /Point chantier/ });
      await userEvent.click(screen.getByRole('button', { name: 'Semaine suivante' }));
      await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-16', '2026-11-22'));
    });

    it('sur téléphone : « Mois et jour » par défaut, barre compacte, tiroir des vues, Créer flottant', async () => {
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: q === '(max-width: 640px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      await monter();
      // La grille du mois entier ; la journée choisie (aujourd'hui) dessous,
      // sur la grille des heures (23/11/2026) : ses rendez-vous à leur place.
      await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-10-26', '2026-12-06'));
      const journee = await screen.findByRole('region', { name: /Jeudi 12 novembre/ });
      expect(journee.querySelector('.agenda-grille-corps')).not.toBeNull();
      expect(within(journee).getByRole('button', { name: /Point chantier/ })).toBeInTheDocument();
      // Le 12 est choisi et porte un point ; toucher le 13 le choisit.
      const mois = screen.getByRole('group', { name: 'Choisir un jour' });
      const douze = within(mois).getByRole('button', { name: /jeudi 12 novembre · 1 élément/ });
      expect(douze).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(within(mois).getByRole('button', { name: /^vendredi 13 novembre$/ }));
      const vendredi = await screen.findByRole('region', { name: /Vendredi 13 novembre/ });
      expect(vendredi.querySelector('.agenda-grille-corps')).not.toBeNull();
      expect(within(vendredi).queryByRole('button', { name: /Point chantier/ })).not.toBeInTheDocument();
      // Le mois en titre (sans menu déroulant), pas de flèches ; Créer flotte au pouce.
      expect(screen.getByRole('heading', { name: 'Novembre 2026' })).toBeInTheDocument();
      expect(document.querySelector('.agenda-barre .agenda-fleches')).toBeNull();
      expect(document.querySelector('.agenda-fab')).toHaveAccessibleName('Créer un rendez-vous');
      // Les vues, dans le tiroir : Planning charge les 30 jours.
      await userEvent.click(screen.getByRole('button', { name: 'Vues et agendas' }));
      const tiroir = await screen.findByRole('dialog', { name: 'Vues et agendas' });
      expect(within(tiroir).getByRole('button', { name: 'Mois et jour' })).toHaveAttribute('aria-current', 'true');
      await userEvent.click(within(tiroir).getByRole('button', { name: 'Planning' }));
      await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-13', '2026-12-12'));
      expect(screen.queryByRole('dialog', { name: 'Vues et agendas' })).not.toBeInTheDocument();
    });

    it('ordinateur : la colonne se replie d’un clic, et le choix est gardé', async () => {
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: q === '(min-width: 1101px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      localStorage.clear();
      await monter();
      await screen.findByRole('button', { name: /Point chantier/ });
      const bouton = screen.getByRole('button', { name: 'Colonne des agendas' });
      expect(bouton).toHaveAttribute('aria-expanded', 'true');
      await userEvent.click(bouton);
      expect(bouton).toHaveAttribute('aria-expanded', 'false');
      expect(document.querySelector('.agenda-disposition')).toHaveClass('is-colonne-masquee');
      // Pas de tiroir sur grand écran.
      expect(screen.queryByRole('dialog', { name: 'Vues et agendas' })).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem('hub.agenda.gc.U1') ?? '{}')).toMatchObject({ colonneMasquee: true });
      localStorage.clear();
    });

    it('ordinateur : une colonne repliée la dernière fois le reste au retour ; ignoré sous 1100 px', async () => {
      localStorage.setItem('hub.agenda.gc.U1', JSON.stringify({ colonneMasquee: true }));
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: q === '(min-width: 1101px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      await monter();
      await screen.findByRole('button', { name: /Point chantier/ });
      expect(document.querySelector('.agenda-disposition')).toHaveClass('is-colonne-masquee');
      expect(screen.getByRole('button', { name: 'Colonne des agendas' })).toHaveAttribute('aria-expanded', 'false');
      localStorage.clear();
    });

    it('sur tablette : le tiroir prend le focus, Échap le ferme et rend le focus au bouton', async () => {
      await monter();
      await screen.findByRole('button', { name: /Point chantier/ });
      const bouton = screen.getByRole('button', { name: 'Colonne des agendas' });
      await userEvent.click(bouton);
      const tiroir = await screen.findByRole('dialog', { name: 'Vues et agendas' });
      expect(within(tiroir).getByRole('button', { name: 'Fermer' })).toHaveFocus();
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'Vues et agendas' })).not.toBeInTheDocument();
      expect(bouton).toHaveFocus();
    });

    it('sur téléphone, le mini-calendrier du titre se ferme à Échap', async () => {
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: q === '(max-width: 640px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      await monter();
      await screen.findByRole('group', { name: 'Choisir un jour' });
      // En « Mois et jour », le titre n'ouvre rien : on passe en 3 jours.
      await userEvent.click(screen.getByRole('button', { name: 'Vues et agendas' }));
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '3 jours' }));
      const titre = await screen.findByRole('button', { name: /Novembre 2026/ });
      await userEvent.click(titre);
      expect(document.getElementById('agenda-mini-deroulant')).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
      expect(document.getElementById('agenda-mini-deroulant')).toBeNull();
    });

    it('sur téléphone, glisser le doigt vers la gauche avance d’un mois', async () => {
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: q === '(max-width: 640px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      await monter();
      const ligne = await screen.findByRole('button', { name: /Point chantier/ });
      const zone = ligne.closest('.agenda-principal')!;
      fireEvent.touchStart(zone, { touches: [{ clientX: 300, clientY: 400 }] });
      fireEvent.touchEnd(zone, { changedTouches: [{ clientX: 120, clientY: 410 }] });
      // Décembre : la grille du lundi 30 novembre au 10 janvier.
      await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-30', '2027-01-10'));
      // Un geste surtout vertical (défilement) ne change pas de période.
      const appels = api.getAgenda.mock.calls.length;
      fireEvent.touchStart(zone, { touches: [{ clientX: 200, clientY: 100 }] });
      fireEvent.touchEnd(zone, { changedTouches: [{ clientX: 120, clientY: 400 }] });
      expect(api.getAgenda.mock.calls.length).toBe(appels);
    });
  });

  describe('« Mois et jour » sur téléphone (grille des heures, 23/11/2026)', () => {
    beforeEach(() => {
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: q === '(max-width: 640px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
    });

    it('toucher une heure vide ouvre le formulaire complet, au jour et à l’heure touchés', async () => {
      await monter();
      const journee = await screen.findByRole('region', { name: /Jeudi 12 novembre/ });
      fireEvent.click(journee.querySelector('.agenda-grille-colonne')!, { clientY: 14.75 * 48 });
      expect(await screen.findByRole('heading', { name: /Nouveau rendez-vous/ })).toBeInTheDocument();
      expect(screen.getByLabelText('Date')).toHaveValue(J);
      expect(screen.getByLabelText('Début')).toHaveValue('14:30');
      expect(screen.getByLabelText('Fin')).toHaveValue('15:30');
    });

    it('balayer la journée change de jour ; balayer le mois change de mois', async () => {
      await monter();
      const journee = await screen.findByRole('region', { name: /Jeudi 12 novembre/ });
      const grille = journee.querySelector('.agenda-grille-corps')!;
      fireEvent.touchStart(grille, { touches: [{ clientX: 300, clientY: 400 }] });
      fireEvent.touchEnd(grille, { changedTouches: [{ clientX: 120, clientY: 410 }] });
      const vendredi = await screen.findByRole('region', { name: /Vendredi 13 novembre/ });
      // Même mois : rien à relire.
      expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-10-26', '2026-12-06');
      // La grille du nouveau jour (elle est recréée à chaque jour).
      const grille13 = vendredi.querySelector('.agenda-grille-corps')!;
      fireEvent.touchStart(grille13, { touches: [{ clientX: 120, clientY: 400 }] });
      fireEvent.touchEnd(grille13, { changedTouches: [{ clientX: 300, clientY: 410 }] });
      expect(await screen.findByRole('region', { name: /Jeudi 12 novembre/ })).toBeInTheDocument();
      // Sur le mois : le mois suivant.
      const mois = screen.getByRole('group', { name: 'Choisir un jour' });
      fireEvent.touchStart(mois, { touches: [{ clientX: 300, clientY: 200 }] });
      fireEvent.touchEnd(mois, { changedTouches: [{ clientX: 120, clientY: 210 }] });
      await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-30', '2027-01-10'));
    });
  });

  describe('modifier depuis la fiche', () => {
    it('« Modifier » ouvre le formulaire pré-rempli, et l’enregistrement recharge l’agenda', async () => {
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      const fiche = await screen.findByRole('dialog');
      await userEvent.click(within(fiche).getByRole('button', { name: 'Modifier' }));

      expect(await screen.findByRole('heading', { name: /Modifier le rendez-vous/ })).toBeInTheDocument();
      // La fiche se ferme : un seul dialogue ouvert, le formulaire.
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByLabelText('Objet')).toHaveValue('Point chantier');
      expect(screen.getByLabelText('Date')).toHaveValue(J);
      expect(screen.getByLabelText('Début')).toHaveValue('09:00');
      expect(screen.getByLabelText('Fin')).toHaveValue('10:00');
      expect(screen.getByLabelText('Lieu (facultatif)')).toHaveValue('Plateau');
      expect(screen.getByLabelText('Note (facultatif)')).toHaveValue('Apporter les plans');
      expect(screen.getByLabelText('Moussa Sow')).toBeChecked();
      expect(screen.getByLabelText('Fatou Ba')).not.toBeChecked();

      const appels = api.getAgenda.mock.calls.length;
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
      expect(api.modifierRendezVous).toHaveBeenCalledWith('gc', 'R1', {
        titre: 'Point chantier',
        debut: `${J}T09:00:00.000Z`,
        fin: `${J}T10:00:00.000Z`,
        lieu: 'Plateau',
        description: 'Apporter les plans',
        inviteIds: ['U2'],
        lienVisio: null,
        rappelMinutes: null,
        regle: null,
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(api.getAgenda.mock.calls.length).toBeGreaterThan(appels);
    });

    it('sans le droit « Réunions », seuls les invités déjà là sont proposés (on peut les retirer)', async () => {
      api.getAgenda.mockImplementation((_slug: string, du: string, au: string) =>
        Promise.resolve(reponse(du, au, { peutInviter: false })),
      );
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Modifier' }));
      expect(await screen.findByLabelText('Moussa Sow')).toBeChecked();
      expect(screen.queryByLabelText('Fatou Ba')).not.toBeInTheDocument();
    });

    it('un rendez-vous non modifiable (entretien) n’offre pas « Modifier » dans sa fiche', async () => {
      api.getAgenda.mockImplementation((_slug: string, du: string, au: string) =>
        Promise.resolve(
          reponse(du, au, { elements: [{ ...RDV, modifiable: false, annulable: false, entretien: true }] }),
        ),
      );
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      const fiche = await screen.findByRole('dialog');
      expect(within(fiche).queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
      expect(within(fiche).getByText(/se replanifie ou s’annule depuis le recrutement/)).toBeInTheDocument();
    });
  });

  // Colonne de gauche (12/11/2026) : agendas de collègues superposés, types masqués.
  describe('colonne', () => {
    afterEach(() => localStorage.clear());

    it('cocher un collègue lit son agenda et l’affiche dans sa couleur ; masquer un type le retire', async () => {
      const deFatou: ElementAgenda = {
        ...RDV,
        id: 'R9',
        titre: 'Visite terrain',
        debut: `${J}T14:00:00.000Z`,
        fin: `${J}T15:00:00.000Z`,
        modifiable: false,
        annulable: false,
      };
      api.getAgenda.mockImplementation((_s: string, du: string, au: string, personne?: string) =>
        Promise.resolve(
          personne === 'U3'
            ? reponse(du, au, { personne: { id: 'U3', nom: 'Fatou Ba' }, elements: [deFatou] })
            : reponse(du, au, { peutVoirAutres: true }),
        ),
      );
      await monter();
      await userEvent.click(await screen.findByLabelText('Fatou Ba'));
      await waitFor(() => expect(api.getAgenda).toHaveBeenCalledWith('gc', '2026-11-09', '2026-11-15', 'U3'));
      const bloc = await screen.findByRole('button', { name: /Fatou Ba : Visite terrain/ });
      expect(bloc.getAttribute('style')).toContain('--ton: var(--azur)');
      // Préférences propres à ce compte (U1) dans ce navigateur.
      expect(JSON.parse(localStorage.getItem('hub.agenda.gc.U1') ?? '{}')).toMatchObject({ collegues: ['U3'] });

      await userEvent.click(screen.getByLabelText('Rendez-vous'));
      expect(screen.queryByRole('button', { name: /Visite terrain/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Point chantier/ })).not.toBeInTheDocument();
    });

    it('un collègue resté dans les préférences mais plus dans la société est ignoré', async () => {
      localStorage.setItem('hub.agenda.gc.U1', JSON.stringify({ collegues: ['PARTI', 'U3'] }));
      api.getAgenda.mockImplementation((_s: string, du: string, au: string) =>
        Promise.resolve(reponse(du, au, { peutVoirAutres: true })),
      );
      await monter();
      await waitFor(() => expect(api.getAgenda).toHaveBeenCalledWith('gc', '2026-11-09', '2026-11-15', 'U3'));
      expect(api.getAgenda).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 'PARTI');
      expect(screen.getByLabelText('Fatou Ba')).toBeChecked();
    });
  });

  // « Voir son agenda » depuis l'annuaire (22/11/2026) : ?collegue=… superpose
  // l'agenda d'un collègue pour la visite, puis quitte l'adresse.
  describe('adresse ?collegue=', () => {
    const CLE = 'hub.agenda.gc.U1';
    // Sept collègues (U2 à U8) : de quoi dépasser la limite de 5 agendas.
    const COLLEGUES = [
      { id: 'U2', nom: 'Moussa Sow' },
      { id: 'U3', nom: 'Fatou Ba' },
      { id: 'U4', nom: 'Ibrahima Fall' },
      { id: 'U5', nom: 'Aminata Ndiaye' },
      { id: 'U6', nom: 'Cheikh Diallo' },
      { id: 'U7', nom: 'Mariama Sy' },
      { id: 'U8', nom: 'Ousmane Kane' },
    ];
    const nom = (id: string) => COLLEGUES.find((p) => p.id === id)!.nom;
    const aller = (chemin: string) => window.history.replaceState(null, '', chemin);
    const lusPour = (id: string) => api.getAgenda.mock.calls.filter((appel: unknown[]) => appel[3] === id).length;

    beforeEach(() => {
      api.getPersonnesAgenda.mockResolvedValue(COLLEGUES);
      // Chaque collègue a une réunion « Agenda de <nom> » ; soi-même voit les autres.
      api.getAgenda.mockImplementation((_s: string, du: string, au: string, personne?: string) =>
        Promise.resolve(
          personne
            ? reponse(du, au, {
                personne: { id: personne, nom: nom(personne) },
                elements: [
                  {
                    ...RDV,
                    id: `R-${personne}`,
                    titre: `Réunion de ${personne}`,
                    debut: `${J}T14:00:00.000Z`,
                    fin: `${J}T15:00:00.000Z`,
                    modifiable: false,
                    annulable: false,
                  },
                ],
              })
            : reponse(du, au, { peutVoirAutres: true }),
        ),
      );
    });
    afterEach(() => {
      localStorage.clear();
      aller('/');
    });

    it('coche et affiche l’agenda du collègue demandé, puis retire le paramètre de l’adresse', async () => {
      aller('/admin/gc/agenda?collegue=U3&autre=1');
      await monter();
      await waitFor(() => expect(screen.getByLabelText('Fatou Ba')).toBeChecked());
      expect(api.getAgenda).toHaveBeenCalledWith('gc', '2026-11-09', '2026-11-15', 'U3');
      const bloc = await screen.findByRole('button', { name: /Fatou Ba : Réunion de U3/ });
      expect(bloc.getAttribute('style')).toContain('--ton: var(--azur)');
      // Seul « collegue » quitte l'adresse : le reste est gardé.
      expect(window.location.pathname).toBe('/admin/gc/agenda');
      expect(window.location.search).toBe('?autre=1');
      expect(screen.getByLabelText('Moussa Sow')).not.toBeChecked();
    });

    it('sans paramètre, l’adresse n’est pas réécrite', async () => {
      const remplacer = vi.spyOn(window.history, 'replaceState');
      aller('/admin/gc/agenda');
      remplacer.mockClear();
      await monter();
      await screen.findByRole('button', { name: /Point chantier/ });
      expect(remplacer).not.toHaveBeenCalled();
      remplacer.mockRestore();
    });

    it('fusionne avec les préférences : le collègue demandé passe en tête, sans doublon, les autres réglages restent', async () => {
      localStorage.setItem(
        CLE,
        JSON.stringify({ collegues: ['U2', 'U3', 'U4', 'U5', 'U6'], masques: ['echeance'], colonneMasquee: false }),
      );
      aller('/admin/gc/agenda?collegue=U3');
      await monter();
      await waitFor(() => expect(screen.getByLabelText('Fatou Ba')).toBeChecked());
      // Déjà présent : il ne prend pas une seconde place, les cinq restent cochés.
      for (const id of ['U2', 'U4', 'U5', 'U6']) expect(screen.getByLabelText(nom(id))).toBeChecked();
      expect(screen.getByLabelText('Mariama Sy')).toBeDisabled();
      await waitFor(() => expect(lusPour('U6')).toBeGreaterThan(0));
      // En tête : la première couleur ; Moussa (U2) passe à la deuxième.
      expect((await screen.findByRole('button', { name: /Fatou Ba : Réunion de U3/ })).getAttribute('style')).toContain(
        '--ton: var(--azur)',
      );
      expect(screen.getByRole('button', { name: /Moussa Sow : Réunion de U2/ }).getAttribute('style')).toContain(
        '--ton: var(--mandarine)',
      );
      // Le type masqué l'est toujours.
      expect(screen.getByLabelText('Échéance')).not.toBeChecked();
      expect(screen.getByLabelText('Rendez-vous')).toBeChecked();
      expect(window.location.search).toBe('');
    });

    it('5 agendas au plus : le collègue demandé entre, le dernier des préférences sort', async () => {
      localStorage.setItem(CLE, JSON.stringify({ collegues: ['U2', 'U3', 'U4', 'U5', 'U6'] }));
      aller('/admin/gc/agenda?collegue=U7');
      await monter();
      await waitFor(() => expect(screen.getByLabelText('Mariama Sy')).toBeChecked());
      for (const id of ['U2', 'U3', 'U4', 'U5']) expect(screen.getByLabelText(nom(id))).toBeChecked();
      expect(screen.getByLabelText('Cheikh Diallo')).not.toBeChecked();
      expect(screen.getByLabelText('Cheikh Diallo')).toBeDisabled();
      expect(screen.getByText('5 agendas au plus en même temps.')).toBeInTheDocument();
      await waitFor(() => expect(lusPour('U7')).toBeGreaterThan(0));
      expect(lusPour('U6')).toBe(0);
    });

    it('un id inconnu (hors des personnes) n’affiche rien et ne casse rien', async () => {
      localStorage.setItem(CLE, JSON.stringify({ collegues: ['U3'] }));
      aller('/admin/gc/agenda?collegue=INCONNU');
      await monter();
      await screen.findByRole('button', { name: /Point chantier/ });
      await waitFor(() => expect(screen.getByLabelText('Fatou Ba')).toBeChecked());
      expect(await screen.findByRole('button', { name: /Fatou Ba : Réunion de U3/ })).toBeInTheDocument();
      expect(lusPour('INCONNU')).toBe(0);
      expect(screen.queryByText('Agenda indisponible.')).not.toBeInTheDocument();
      // Aucun collègue de plus n'est coché.
      const coches = COLLEGUES.filter((p) => (screen.getByLabelText(p.nom) as HTMLInputElement).checked);
      expect(coches.map((p) => p.id)).toEqual(['U3']);
      expect(window.location.search).toBe('');
    });

    // Corrigé le 23/11/2026 : la coupe à 5 vient après le filtre des collègues
    // actuels ; un id inconnu (ou son propre id) ne prend la place de personne.
    it('un id inconnu ne chasse pas un des 5 agendas enregistrés', async () => {
      localStorage.setItem(CLE, JSON.stringify({ collegues: ['U2', 'U3', 'U4', 'U5', 'U6'] }));
      aller('/admin/gc/agenda?collegue=INCONNU');
      await monter();
      await waitFor(() => expect(screen.getByLabelText('Moussa Sow')).toBeChecked());
      for (const id of ['U2', 'U3', 'U4', 'U5', 'U6']) expect(screen.getByLabelText(nom(id))).toBeChecked();
      await waitFor(() => expect(lusPour('U6')).toBeGreaterThan(0));
    });

    it('le paramètre seul n’écrit rien dans les préférences du navigateur', async () => {
      const enregistrer = vi.spyOn(Storage.prototype, 'setItem');
      aller('/admin/gc/agenda?collegue=U3');
      await monter();
      await waitFor(() => expect(screen.getByLabelText('Fatou Ba')).toBeChecked());
      await screen.findByRole('button', { name: /Fatou Ba : Réunion de U3/ });
      expect(enregistrer).not.toHaveBeenCalled();
      expect(localStorage.getItem(CLE)).toBeNull();
      enregistrer.mockRestore();
    });

    it('le paramètre seul laisse intactes des préférences déjà enregistrées', async () => {
      const avant = JSON.stringify({ masques: [], collegues: ['U2'], colonneMasquee: false });
      localStorage.setItem(CLE, avant);
      aller('/admin/gc/agenda?collegue=U3');
      await monter();
      await waitFor(() => expect(screen.getByLabelText('Fatou Ba')).toBeChecked());
      expect(screen.getByLabelText('Moussa Sow')).toBeChecked();
      expect(localStorage.getItem(CLE)).toBe(avant);
    });
  });
  // Lot B3 (12/11/2026) : l'invité répond depuis la fiche.
  describe('répondre à une invitation', () => {
    const INVITATION: ElementAgenda = {
      ...RDV,
      // Pas encore terminée à l'heure figée du test (10 h) : on peut répondre.
      debut: `${J}T14:00:00.000Z`,
      fin: `${J}T15:00:00.000Z`,
      organisateur: 'Fatou Ba',
      invites: ['Awa Diop', 'Moussa Sow'],
      participants: [
        { nom: 'Awa Diop', reponse: null },
        { nom: 'Moussa Sow', reponse: 'oui' },
      ],
      jeSuisOrganisateur: false,
      modifiable: false,
      annulable: false,
      maReponse: null,
      inviteIds: [],
    };
    const avecInvitation = (e: ElementAgenda = INVITATION) =>
      api.getAgenda.mockImplementation((_s: string, du: string, au: string) =>
        Promise.resolve(reponse(du, au, { elements: [e] })),
      );

    it('« Oui » envoie la réponse, la fiche la montre choisie et l’agenda se recharge', async () => {
      avecInvitation();
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      const groupe = within(await screen.findByRole('dialog')).getByRole('group', { name: 'Votre réponse' });
      const appels = api.getAgenda.mock.calls.length;
      await userEvent.click(within(groupe).getByRole('button', { name: 'Oui' }));

      expect(api.repondreInvitation).toHaveBeenCalledWith('gc', 'R1', 'oui');
      await waitFor(() =>
        expect(within(groupe).getByRole('button', { name: 'Oui' })).toHaveAttribute('aria-pressed', 'true'),
      );
      expect(within(groupe).getByRole('button', { name: 'Non' })).toHaveAttribute('aria-pressed', 'false');
      // La fiche reste ouverte, l'agenda est relu.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await waitFor(() => expect(api.getAgenda.mock.calls.length).toBeGreaterThan(appels));
    });

    it('changer d’avis : « Non » remplace « Oui »', async () => {
      avecInvitation({ ...INVITATION, maReponse: 'oui' });
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      const groupe = within(await screen.findByRole('dialog')).getByRole('group', { name: 'Votre réponse' });
      expect(within(groupe).getByRole('button', { name: 'Oui' })).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(within(groupe).getByRole('button', { name: 'Non' }));
      expect(api.repondreInvitation).toHaveBeenCalledWith('gc', 'R1', 'non');
      await waitFor(() =>
        expect(within(groupe).getByRole('button', { name: 'Non' })).toHaveAttribute('aria-pressed', 'true'),
      );
      expect(within(groupe).getByRole('button', { name: 'Oui' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('refusée par le serveur : la fiche se ferme et le message s’affiche', async () => {
      avecInvitation();
      api.repondreInvitation.mockRejectedValue(new ApiError('Cette réunion est passée.', 409));
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Peut-être' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await screen.findByText('Cette réunion est passée.')).toBeInTheDocument();
    });

    it('panne réseau : message générique', async () => {
      avecInvitation();
      api.repondreInvitation.mockRejectedValue(new TypeError('Failed to fetch'));
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Oui' }));
      expect(await screen.findByText('La réponse n’a pas été enregistrée.')).toBeInTheDocument();
    });

    it('l’organisateur n’a pas de boutons de réponse', async () => {
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      expect(
        within(await screen.findByRole('dialog')).queryByRole('group', { name: 'Votre réponse' }),
      ).not.toBeInTheDocument();
    });

    it('la réunion déclinée est effacée dans la grille', async () => {
      avecInvitation({ ...INVITATION, maReponse: 'non' });
      await monter();
      expect(await screen.findByRole('button', { name: /Point chantier/ })).toHaveClass('is-decline');
    });

    // Après sa réponse, sa ligne dans la liste des participants de la fiche
    // ouverte suit aussi (corrigé le 13/11/2026).
    it('la liste des participants de la fiche suit sa propre réponse', async () => {
      avecInvitation();
      // Après la réponse, le serveur renvoie la réunion à jour.
      api.repondreInvitation.mockImplementation(async () => {
        avecInvitation({
          ...INVITATION,
          maReponse: 'oui',
          participants: [{ nom: 'Awa Diop', reponse: 'oui' }, INVITATION.participants[1]],
        });
        return { ok: true };
      });
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      const fiche = await screen.findByRole('dialog');
      await userEvent.click(within(fiche).getByRole('button', { name: 'Oui' }));
      const ligne = (await within(fiche).findByText('Awa Diop')).closest('li')!;
      await waitFor(() => expect(ligne).toHaveTextContent('Oui'));
    });
  });

  // Récurrence (16/11/2026) : sur une occurrence d'une série, la portée.
  describe('série', () => {
    const OCC: ElementAgenda = {
      ...RDV,
      id: 'S1:2026-11-12T09:00:00.000Z',
      serieId: 'S1',
      occurrence: '2026-11-12T09:00:00.000Z',
      regle: 'FREQ=WEEKLY;BYDAY=TH',
      regleTexte: 'Chaque semaine le jeudi',
      // La série commence le jeudi 5 novembre, de 9 h à 10 h.
      serie: {
        debut: '2026-11-05T09:00:00.000Z',
        fin: '2026-11-05T10:00:00.000Z',
        titre: 'Point chantier',
        lieu: 'Plateau',
        description: 'Apporter les plans',
        lienVisio: null,
      },
    };
    const avecSerie = () =>
      api.getAgenda.mockImplementation((_s: string, du: string, au: string) =>
        Promise.resolve(reponse(du, au, { elements: [OCC] })),
      );

    it('modifier : la portée d’abord, puis le formulaire ; la série reçoit portée et occurrence', async () => {
      avecSerie();
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      expect(screen.getByText('Chaque semaine le jeudi')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Modifier' }));
      // La fenêtre de portée, avant le formulaire.
      const fenetre = await screen.findByRole('dialog', { name: /Modifier un événement récurrent/ });
      await userEvent.click(within(fenetre).getByLabelText('Cet événement et les suivants'));
      await userEvent.click(within(fenetre).getByRole('button', { name: 'Continuer' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));
      await waitFor(() =>
        expect(api.modifierRendezVous).toHaveBeenCalledWith(
          'gc',
          'S1',
          expect.objectContaining({
            portee: 'suivantes',
            occurrence: '2026-11-12T09:00:00.000Z',
            regle: 'FREQ=WEEKLY;BYDAY=TH',
          }),
        ),
      );
    });

    it('modifier « tous les événements » : le formulaire montre la série, pas l’occurrence déplacée', async () => {
      api.getAgenda.mockImplementation((_s: string, du: string, au: string) =>
        Promise.resolve(
          reponse(du, au, {
            elements: [
              {
                ...OCC,
                debut: `${J}T14:00:00.000Z`,
                fin: `${J}T15:00:00.000Z`,
                lieu: 'Chantier',
                occurrenceModifiee: true,
                serie: {
                  debut: '2026-11-05T09:00:00.000Z',
                  fin: '2026-11-05T10:00:00.000Z',
                  titre: 'Point chantier',
                  lieu: 'Plateau',
                  description: null,
                  lienVisio: null,
                },
              },
            ],
          }),
        ),
      );
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Modifier' }));
      const fenetre = await screen.findByRole('dialog', { name: /Modifier un événement récurrent/ });
      await userEvent.click(within(fenetre).getByLabelText('Tous les événements'));
      await userEvent.click(within(fenetre).getByRole('button', { name: 'Continuer' }));
      expect(await screen.findByLabelText('Date')).toHaveValue('2026-11-05');
      expect(screen.getByLabelText('Début')).toHaveValue('09:00');
      expect(screen.getByLabelText('Lieu (facultatif)')).toHaveValue('Plateau');
    });

    it('annuler : la portée tient lieu de confirmation ; « Cet événement » vise cette date ; « Retour » abandonne', async () => {
      avecSerie();
      api.annulerRendezVous.mockResolvedValue({ ok: true });
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Annuler le rendez-vous' }));
      expect(confirmer).not.toHaveBeenCalled();
      let fenetre = await screen.findByRole('dialog', { name: /Annuler un événement récurrent/ });
      await userEvent.click(within(fenetre).getByRole('button', { name: 'Retour' }));
      expect(api.annulerRendezVous).not.toHaveBeenCalled();

      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Annuler le rendez-vous' }));
      fenetre = await screen.findByRole('dialog', { name: /Annuler un événement récurrent/ });
      await userEvent.click(within(fenetre).getByRole('button', { name: 'Confirmer' }));
      await waitFor(() =>
        expect(api.annulerRendezVous).toHaveBeenCalledWith('gc', 'S1', 'occurrence', '2026-11-12T09:00:00.000Z'),
      );
    });

    // Glisser d'une heure vers le bas dans la grille (pointeur ; même geste
    // que dans grille-horaire.spec.tsx).
    const glisserDUneHeure = (bloc: HTMLElement) => {
      fireEvent.pointerDown(bloc, { button: 0, pointerType: 'mouse', clientX: 10, clientY: 100 });
      fireEvent.pointerMove(bloc, { pointerType: 'mouse', buttons: 1, clientX: 10, clientY: 148 });
      fireEvent.pointerUp(bloc, { pointerType: 'mouse', clientX: 10, clientY: 148 });
    };

    it('glisser une occurrence : la portée est demandée (sans autre confirmation), puis la série reçoit portée et occurrence', async () => {
      avecSerie();
      await monter();
      glisserDUneHeure(await screen.findByRole('button', { name: /Point chantier/ }));
      const fenetre = await screen.findByRole('dialog', { name: /Déplacer un événement récurrent/ });
      expect(confirmer).not.toHaveBeenCalled();
      expect(api.modifierRendezVous).not.toHaveBeenCalled();
      await userEvent.click(within(fenetre).getByRole('radio', { name: 'Tous les événements' }));
      await userEvent.click(within(fenetre).getByRole('button', { name: 'Déplacer' }));
      await waitFor(() =>
        expect(api.modifierRendezVous).toHaveBeenCalledWith(
          'gc',
          'S1',
          // Toute la série décalée d'une heure, depuis son premier rendez-vous.
          expect.objectContaining({
            debut: '2026-11-05T10:00:00.000Z',
            fin: '2026-11-05T11:00:00.000Z',
            portee: 'toutes',
            occurrence: '2026-11-12T09:00:00.000Z',
            regle: 'FREQ=WEEKLY;BYDAY=TH',
            inviteIds: ['U2'],
          }),
        ),
      );
    });

    it('glisser une occurrence puis « Retour » : rien n’est enregistré', async () => {
      avecSerie();
      await monter();
      glisserDUneHeure(await screen.findByRole('button', { name: /Point chantier/ }));
      const fenetre = await screen.findByRole('dialog', { name: /Déplacer un événement récurrent/ });
      await userEvent.click(within(fenetre).getByRole('button', { name: 'Retour' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(api.modifierRendezVous).not.toHaveBeenCalled();
      expect(confirmer).not.toHaveBeenCalled();
    });

    it('glisser un rendez-vous unique avec invités : confirmation classique, aucune portée envoyée', async () => {
      confirmer.mockResolvedValueOnce(true);
      await monter();
      glisserDUneHeure(await screen.findByRole('button', { name: /Point chantier/ }));
      await waitFor(() => expect(api.modifierRendezVous).toHaveBeenCalled());
      expect(confirmer).toHaveBeenCalledWith(expect.objectContaining({ titre: 'Déplacer la réunion ?' }));
      expect(screen.queryByRole('dialog', { name: /événement récurrent/ })).not.toBeInTheDocument();
      const [, id, corps] = api.modifierRendezVous.mock.calls[0];
      expect(id).toBe('R1');
      expect(corps).toMatchObject({ debut: `${J}T10:00:00.000Z`, fin: `${J}T11:00:00.000Z` });
      expect(corps).not.toHaveProperty('portee');
      expect(corps).not.toHaveProperty('occurrence');
    });

    it('fiche d’une occurrence modifiée : « cette date modifiée » après la règle', async () => {
      api.getAgenda.mockImplementation((_s: string, du: string, au: string) =>
        Promise.resolve(reponse(du, au, { elements: [{ ...OCC, occurrenceModifiee: true }] })),
      );
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      expect(await screen.findByText('Chaque semaine le jeudi · cette date modifiée')).toBeInTheDocument();
    });
  });

  // U5 (23/11/2026) : raccourcis clavier, chargement, erreur de lecture et
  // annonce de la période au lecteur d'écran.
  describe('U5', () => {
    const ordinateur = () => {
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: q === '(min-width: 1101px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
    };
    // Une lecture lente : la promesse attend qu'on la résolve.
    const lectureLente = () => {
      const enAttente: { resoudre: () => void; rejeter: (e: unknown) => void }[] = [];
      api.getAgenda.mockImplementation(
        (_s: string, du: string, au: string) =>
          new Promise<SemaineAgenda>((ok, ko) => {
            enAttente.push({ resoudre: () => ok(reponse(du, au)), rejeter: ko });
          }),
      );
      return enAttente;
    };
    const vueAffichee = () => document.querySelector('.agenda-vue')!;
    const annonce = () => document.querySelector('p.sr-only[aria-live="polite"]');
    const charge = () => screen.findByRole('button', { name: /Point chantier/ });

    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    describe('raccourcis clavier (ordinateur)', () => {
      beforeEach(ordinateur);

      it('M, J, P puis S changent de vue et lisent la période de chaque vue', async () => {
        await monter();
        await charge();

        await userEvent.keyboard('m');
        expect(screen.getByRole('radio', { name: 'Mois' })).toBeChecked();
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-10-26', '2026-12-06'));

        await userEvent.keyboard('J');
        expect(screen.getByRole('radio', { name: 'Jour' })).toBeChecked();
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', J, J));

        await userEvent.keyboard('p');
        expect(screen.getByRole('radio', { name: 'Planning' })).toBeChecked();
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', J, '2026-12-11'));

        await userEvent.keyboard('s');
        expect(screen.getByRole('radio', { name: 'Semaine' })).toBeChecked();
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-09', '2026-11-15'));
      });

      it('→ avance d’une semaine, ← revient, T ramène à aujourd’hui', async () => {
        await monter();
        await charge();

        await userEvent.keyboard('{ArrowRight}');
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-16', '2026-11-22'));
        await userEvent.keyboard('{ArrowLeft}');
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-09', '2026-11-15'));

        await userEvent.keyboard('{ArrowRight}{ArrowRight}');
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-23', '2026-11-29'));
        await userEvent.keyboard('t');
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-09', '2026-11-15'));
        expect(screen.getByRole('heading', { name: '9 – 15 novembre 2026' })).toBeInTheDocument();
      });

      it('une touche maintenue (répétition automatique) ne fait défiler aucune période', async () => {
        await monter();
        await charge();
        const appels = api.getAgenda.mock.calls.length;
        fireEvent.keyDown(document.body, { key: 'ArrowRight', repeat: true });
        expect(api.getAgenda.mock.calls.length).toBe(appels);
        expect(screen.getByRole('heading', { name: '9 – 15 novembre 2026' })).toBeInTheDocument();
      });

      it('C ouvre le formulaire « Nouveau rendez-vous » à aujourd’hui quand il est affiché', async () => {
        await monter();
        await charge();
        await userEvent.keyboard('c');
        expect(await screen.findByRole('heading', { name: /Nouveau rendez-vous/ })).toBeInTheDocument();
        expect(screen.getByLabelText('Date')).toHaveValue(J);
      });

      it('C, sur une autre semaine, ouvre le formulaire au premier jour affiché', async () => {
        await monter();
        await charge();
        await userEvent.keyboard('{ArrowRight}');
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-16', '2026-11-22'));
        await userEvent.keyboard('C');
        expect(await screen.findByRole('heading', { name: /Nouveau rendez-vous/ })).toBeInTheDocument();
        expect(screen.getByLabelText('Date')).toHaveValue('2026-11-16');
      });

      it('C ne fait rien sans le droit de créer', async () => {
        api.getAgenda.mockImplementation((_s: string, du: string, au: string) =>
          Promise.resolve(reponse(du, au, { peutCreer: false })),
        );
        await monter();
        await charge();
        expect(screen.queryByRole('button', { name: /Créer/ })).not.toBeInTheDocument();
        // Pas de preventDefault non plus : la touche reste au navigateur.
        expect(fireEvent.keyDown(document.body, { key: 'c' })).toBe(true);
        await userEvent.keyboard('c');
        expect(screen.queryByRole('heading', { name: /Nouveau rendez-vous/ })).not.toBeInTheDocument();
      });

      it('une lettre tapée dans la recherche de collègue ne change pas de vue', async () => {
        const nombreux = Array.from({ length: 9 }, (_, i) => ({ id: `U${i + 2}`, nom: `Collègue ${i + 2}` }));
        api.getPersonnesAgenda.mockResolvedValue(nombreux);
        api.getAgenda.mockImplementation((_s: string, du: string, au: string) =>
          Promise.resolve(reponse(du, au, { peutVoirAutres: true })),
        );
        await monter();
        await charge();
        const recherche = await screen.findByRole('searchbox', { name: 'Chercher un collègue' });
        const appels = api.getAgenda.mock.calls.length;
        await userEvent.type(recherche, 'Mts');
        expect(recherche).toHaveValue('Mts');
        expect(screen.getByRole('radio', { name: 'Semaine' })).toBeChecked();
        expect(api.getAgenda.mock.calls.length).toBe(appels);
        // Les flèches déplacent le curseur du champ, pas la période.
        await userEvent.keyboard('{ArrowLeft}{ArrowRight}');
        expect(api.getAgenda.mock.calls.length).toBe(appels);
        expect(screen.getByRole('heading', { name: '9 – 15 novembre 2026' })).toBeInTheDocument();
      });

      it('formulaire ouvert : ni la saisie ni les flèches ne touchent à la vue derrière', async () => {
        await monter();
        await charge();
        await userEvent.keyboard('c');
        await screen.findByRole('heading', { name: /Nouveau rendez-vous/ });
        const appels = api.getAgenda.mock.calls.length;
        const objet = screen.getByLabelText('Objet');
        await userEvent.type(objet, 'Mise au point');
        expect(objet).toHaveValue('Mise au point');
        // Même depuis un bouton de la fenêtre (hors champ) : la fenêtre ouverte suffit.
        screen.getAllByRole('button', { name: /Fermer|Annuler/ })[0].focus();
        await userEvent.keyboard('m{ArrowRight}t');
        expect(screen.getByRole('radio', { name: 'Semaine', hidden: true })).toBeChecked();
        expect(api.getAgenda.mock.calls.length).toBe(appels);
      });

      it('Ctrl+S, ⌘+M et Alt+→ ne font rien et restent au navigateur', async () => {
        await monter();
        await charge();
        const appels = api.getAgenda.mock.calls.length;
        expect(fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })).toBe(true);
        expect(fireEvent.keyDown(document.body, { key: 'm', metaKey: true })).toBe(true);
        expect(fireEvent.keyDown(document.body, { key: 'ArrowRight', altKey: true })).toBe(true);
        await userEvent.keyboard('{Control>}j{/Control}');
        expect(screen.getByRole('radio', { name: 'Semaine' })).toBeChecked();
        expect(api.getAgenda.mock.calls.length).toBe(appels);
      });

      it('X et O (vues du téléphone) ne font rien sur ordinateur', async () => {
        await monter();
        await charge();
        const appels = api.getAgenda.mock.calls.length;
        await userEvent.keyboard('xXoO');
        expect(screen.getByRole('radio', { name: 'Semaine' })).toBeChecked();
        expect(screen.queryByRole('radio', { name: '3 jours' })).not.toBeInTheDocument();
        expect(api.getAgenda.mock.calls.length).toBe(appels);
      });

      it('un raccourci reconnu est retenu (preventDefault) : la page ne défile pas', async () => {
        await monter();
        await charge();
        expect(fireEvent.keyDown(document.body, { key: 'ArrowRight' })).toBe(false);
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-16', '2026-11-22'));
      });

      // Après un clic sur une vue, le focus reste sur le bouton radio : les
      // lettres restent actives (seules les flèches y sont réservées).
      it('après un clic sur « Mois », S repasse en semaine sans cliquer ailleurs', async () => {
        await monter();
        await charge();
        await userEvent.click(screen.getByRole('radio', { name: 'Mois' }));
        await userEvent.keyboard('s');
        expect(screen.getByRole('radio', { name: 'Semaine' })).toBeChecked();
      });

      // Une case cochée garde le focus : les lettres restent actives (seuls
      // les champs de saisie de texte les bloquent).
      it('après avoir décoché « Rendez-vous » dans la colonne, M passe au mois', async () => {
        await monter();
        await charge();
        await userEvent.click(screen.getByLabelText('Rendez-vous'));
        await userEvent.keyboard('m');
        expect(screen.getByRole('radio', { name: 'Mois' })).toBeChecked();
      });
    });

    describe('chargement', () => {
      it('premier chargement : le squelette « Chargement de l’agenda », puis l’agenda', async () => {
        const enAttente = lectureLente();
        await monter();
        expect(screen.getByRole('status')).toHaveTextContent('Chargement de l’agenda');
        // Rien à estomper encore : pas de barre de progression.
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(vueAffichee()).not.toHaveClass('is-chargement');
        await act(async () => enAttente[enAttente.length - 1].resoudre());
        await charge();
        expect(screen.queryByText(/Chargement de l’agenda…/)).not.toBeInTheDocument();
      });

      it('lecture lente après un changement de période : barre de progression et vue estompée, retirées à la réponse', async () => {
        await monter();
        await charge();
        const enAttente = lectureLente();
        await userEvent.click(screen.getByRole('button', { name: 'Semaine suivante' }));
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-16', '2026-11-22'));
        expect(screen.getByRole('progressbar', { name: 'Chargement de l’agenda' })).toBeInTheDocument();
        expect(vueAffichee()).toHaveClass('is-chargement');
        expect(vueAffichee()).toHaveAttribute('aria-busy', 'true');
        // Le squelette ne revient pas : l'agenda d'avant reste affiché, estompé.
        expect(screen.queryByText(/Chargement de l’agenda…/)).not.toBeInTheDocument();

        await act(async () => enAttente[enAttente.length - 1].resoudre());
        await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
        expect(vueAffichee()).not.toHaveClass('is-chargement');
        expect(vueAffichee()).toHaveAttribute('aria-busy', 'false');
      });

      it('une réponse dépassée n’éteint pas la barre de la lecture plus récente', async () => {
        await monter();
        await charge();
        const enAttente = lectureLente();
        const suivante = screen.getByRole('button', { name: 'Semaine suivante' });
        await userEvent.click(suivante);
        await userEvent.click(suivante);
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-23', '2026-11-29'));
        const [ancienne, recente] = [enAttente[enAttente.length - 2], enAttente[enAttente.length - 1]];

        await act(async () => ancienne.resoudre());
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(vueAffichee()).toHaveAttribute('aria-busy', 'true');

        await act(async () => recente.resoudre());
        await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
      });

      it('l’échec d’une lecture dépassée n’affiche aucune erreur', async () => {
        await monter();
        await charge();
        const enAttente = lectureLente();
        const suivante = screen.getByRole('button', { name: 'Semaine suivante' });
        await userEvent.click(suivante);
        await userEvent.click(suivante);
        const [ancienne, recente] = [enAttente[enAttente.length - 2], enAttente[enAttente.length - 1]];
        await act(async () => ancienne.rejeter(new ApiError('Trop tard.', 503)));
        await act(async () => recente.resoudre());
        await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByText('Trop tard.')).not.toBeInTheDocument();
      });
    });

    describe('erreur de lecture', () => {
      it('le message du serveur et « Réessayer » ; réessayer relit et efface le message', async () => {
        api.getAgenda.mockRejectedValue(new ApiError('Agenda momentanément indisponible.', 503));
        await monter();
        const alerte = await screen.findByRole('alert');
        expect(alerte).toHaveTextContent('Agenda momentanément indisponible.');
        // Pas de squelette sans fin à côté du message.
        expect(screen.queryByText(/Chargement de l’agenda…/)).not.toBeInTheDocument();

        api.getAgenda.mockImplementation((_s: string, du: string, au: string) => Promise.resolve(reponse(du, au)));
        const appels = api.getAgenda.mock.calls.length;
        await userEvent.click(within(alerte).getByRole('button', { name: 'Réessayer' }));
        expect(api.getAgenda.mock.calls.length).toBe(appels + 1);
        expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-09', '2026-11-15');
        await charge();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });

      it('une panne réseau (erreur non API) : message générique', async () => {
        api.getAgenda.mockRejectedValue(new TypeError('Failed to fetch'));
        await monter();
        expect(await screen.findByRole('alert')).toHaveTextContent('Agenda indisponible.');
        expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
      });

      it('réessayer qui échoue encore laisse le message et le bouton', async () => {
        api.getAgenda.mockRejectedValue(new ApiError('Agenda momentanément indisponible.', 503));
        await monter();
        await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Réessayer' }));
        await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
        expect(screen.getByRole('alert')).toHaveTextContent('Agenda momentanément indisponible.');
        expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
      });

      // Le message d'une action échouée s'efface au changement de période (et
      // au début de l'action suivante), pas à la relecture qui suit l'échec.
      it('le message d’une action échouée disparaît à la lecture suivante réussie', async () => {
        const invitation: ElementAgenda = {
          ...RDV,
          debut: `${J}T14:00:00.000Z`,
          fin: `${J}T15:00:00.000Z`,
          organisateur: 'Fatou Ba',
          jeSuisOrganisateur: false,
          modifiable: false,
          annulable: false,
          maReponse: null,
          inviteIds: [],
        };
        api.getAgenda.mockImplementation((_s: string, du: string, au: string) =>
          Promise.resolve(reponse(du, au, { elements: [invitation] })),
        );
        api.repondreInvitation.mockRejectedValue(new ApiError('Cette réunion est passée.', 409));
        await monter();
        await userEvent.click(await charge());
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Peut-être' }));
        expect(await screen.findByText('Cette réunion est passée.')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Semaine suivante' }));
        await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-16', '2026-11-22'));
        await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
        expect(screen.queryByText('Cette réunion est passée.')).not.toBeInTheDocument();
      });
    });

    describe('annonce de la période (lecteur d’écran)', () => {
      beforeEach(ordinateur);

      it('une seule zone annoncée : « Semaine, … » puis « Mois, … » après M', async () => {
        await monter();
        await charge();
        expect(annonce()).toHaveTextContent('Semaine, 9 – 15 novembre 2026');
        await userEvent.keyboard('m');
        expect(annonce()).toHaveTextContent('Mois, Novembre 2026');
        // Le titre visible n'est plus annoncé en double.
        expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
      });

      it('la période suivante est annoncée après →', async () => {
        await monter();
        await charge();
        await userEvent.keyboard('{ArrowRight}');
        expect(annonce()).toHaveTextContent('Semaine, 16 – 22 novembre 2026');
        // Le jour gardé est celui de l'ancre (aujourd'hui + 7), pas le lundi.
        await userEvent.keyboard('j');
        expect(annonce()).toHaveTextContent('Jour, jeudi 19 novembre 2026');
      });
    });
  });
});
