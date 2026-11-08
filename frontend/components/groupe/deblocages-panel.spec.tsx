import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/client-api';
import {
  changerCellulesProjet,
  getEtatInterventions,
  onboarderSansSignature,
  ouvrirProjet,
  rouvrirDossier,
  supprimerCode,
  type EtatInterventions,
} from '@/lib/interventions';
import { getJournalAudit, type JournalAudit, type LigneAudit } from '@/lib/pilotage';
import { DeblocagesPanel } from './deblocages-panel';

// API mockée ; l'extraction des interventions récentes (recentUnblocks) reste la vraie.
vi.mock('@/lib/interventions', () => ({
  getEtatInterventions: vi.fn(),
  onboarderSansSignature: vi.fn(),
  rouvrirDossier: vi.fn(),
  ouvrirProjet: vi.fn(),
  changerCellulesProjet: vi.fn(),
  supprimerCode: vi.fn(),
}));
vi.mock('@/lib/pilotage', () => ({ getJournalAudit: vi.fn() }));
// Adresse de la page : stable d'un rendu à l'autre (comme celle de Next).
const adresse = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/groupe', useSearchParams: () => adresse.params }));

const chercherEtat = vi.mocked(getEtatInterventions);
const chargerJournal = vi.mocked(getJournalAudit);
const onboarder = vi.mocked(onboarderSansSignature);
const rouvrir = vi.mocked(rouvrirDossier);
const ouvrirP = vi.mocked(ouvrirProjet);
const changerCellules = vi.mocked(changerCellulesProjet);
const supprimer = vi.mocked(supprimerCode);

const SLUG = 'grey-concrete';
const MAINTENANT = new Date('2026-11-08T10:00:00Z');

// --- Données ---------------------------------------------------------------

const VIDE: EtatInterventions = { dossier: null, projet: null, cellulesDisponibles: [], historique: [] };

const CEL_A = { id: 'c1', nom: 'Cellule Almadies', code: 'CEL-A' };
const CEL_B = { id: 'c2', nom: 'Cellule Plateau', code: 'CEL-P' };

// Offre acceptée, contrat non signé, pas encore de projet : l'Onboard attend.
const EN_ATTENTE: EtatInterventions = {
  ...VIDE,
  dossier: {
    id: 'D1',
    code: 'GB_TBD.26',
    statut: 'offre_envoyee',
    client: 'Moussa Diop',
    offreAcceptee: true,
    contratSigne: false,
  },
};

const PERDU: EtatInterventions = {
  ...VIDE,
  dossier: {
    id: 'D2',
    code: 'GB_TBD.29',
    statut: 'perdu',
    client: 'Fatou Ba',
    offreAcceptee: false,
    contratSigne: false,
  },
};

// Onboard antérieur au 30/10 : projet fermé, gabarit disponible, une cellule.
const PROJET_FERME: EtatInterventions = {
  dossier: {
    id: 'D3',
    code: 'GB_TBD.27',
    statut: 'onboard',
    client: 'Awa Ndiaye',
    offreAcceptee: true,
    contratSigne: true,
  },
  projet: { id: 'P1', code: 'GB_TBD.27', ouvertLe: null, gabarit: true, cellules: [CEL_A] },
  cellulesDisponibles: [CEL_A, CEL_B],
  historique: [],
};

const sansDossier = (projet: NonNullable<EtatInterventions['projet']>): EtatInterventions => ({
  ...VIDE,
  projet,
  cellulesDisponibles: [CEL_A, CEL_B],
});

const JOURNAL_VIDE: JournalAudit = { debut: '2025-11-09', fin: '2026-11-08', lignes: [] };
const ligne = (id: string, action: string, detail: string, extra: Partial<LigneAudit> = {}): LigneAudit => ({
  id,
  le: '2026-11-07T10:00:00.000Z',
  categorie: 'administration',
  action,
  detail,
  par: 'Awa Sarr',
  ...extra,
});

// --- Aides -----------------------------------------------------------------

function differe<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const champCode = () => screen.getByRole('textbox', { name: 'Code du dossier ou du projet' });
const boutonRechercher = () => screen.getByRole('button', { name: /^Recherche/ });

async function afficher() {
  const user = userEvent.setup();
  const vue = render(<DeblocagesPanel slug={SLUG} />);
  // Interventions récentes chargées (ou en échec) : l'écran est stable.
  await waitFor(() => expect(screen.queryByLabelText('Chargement des interventions récentes')).not.toBeInTheDocument());
  return { user, ...vue };
}

async function chercher(etat: EtatInterventions, code = etat.dossier?.code ?? etat.projet?.code ?? 'GB_X') {
  chercherEtat.mockResolvedValueOnce(etat);
  const v = await afficher();
  await v.user.type(champCode(), code);
  await v.user.click(boutonRechercher());
  await screen.findByRole('heading', { name: 'Dossier CRM' });
  return v;
}

async function ouvrirFenetre(user: ReturnType<typeof userEvent.setup>, bouton: string | RegExp, titre: string) {
  await user.click(screen.getByRole('button', { name: bouton }));
  // La suppression est une alerte (role=alertdialog), les autres des fenêtres.
  return screen.getByRole(titre === 'Supprimer définitivement' ? 'alertdialog' : 'dialog', { name: titre });
}

beforeEach(() => {
  vi.resetAllMocks();
  chargerJournal.mockResolvedValue(JOURNAL_VIDE);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
  adresse.params = new URLSearchParams();
  window.history.replaceState(null, '', '/groupe');
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Recherche --------------------------------------------------------------

describe('DeblocagesPanel · recherche d’un code', () => {
  it('désactive « Rechercher » tant qu’aucun code n’est saisi (espaces seuls compris)', async () => {
    const { user } = await afficher();
    expect(boutonRechercher()).toBeDisabled();
    await user.type(champCode(), '   ');
    expect(boutonRechercher()).toBeDisabled();
    await user.type(champCode(), 'G');
    expect(boutonRechercher()).toBeEnabled();
  });

  it('cherche le code sans les espaces autour et affiche le dossier trouvé', async () => {
    chercherEtat.mockResolvedValueOnce(EN_ATTENTE);
    const { user } = await afficher();
    await user.type(champCode(), '  GB_TBD.26  ');
    await user.click(boutonRechercher());
    expect(chercherEtat).toHaveBeenCalledWith(SLUG, 'GB_TBD.26');
    expect(await screen.findByText('Moussa Diop')).toBeInTheDocument();
    expect(champCode()).toHaveValue('GB_TBD.26');
  });

  it('la touche Entrée dans le champ lance aussi la recherche', async () => {
    chercherEtat.mockResolvedValueOnce(EN_ATTENTE);
    const { user } = await afficher();
    await user.type(champCode(), 'GB_TBD.26{Enter}');
    expect(chercherEtat).toHaveBeenCalledWith(SLUG, 'GB_TBD.26');
  });

  it('montre « Recherche… » et désactive le bouton pendant la recherche', async () => {
    const reponse = differe<EtatInterventions>();
    chercherEtat.mockReturnValueOnce(reponse.promise);
    const { user } = await afficher();
    await user.type(champCode(), 'GB_TBD.26');
    await user.click(boutonRechercher());
    expect(screen.getByRole('button', { name: 'Recherche…' })).toBeDisabled();
    await act(async () => reponse.resolve(EN_ATTENTE));
    expect(screen.getByRole('button', { name: 'Rechercher' })).toBeEnabled();
  });

  it('écrit le code cherché dans l’adresse en gardant l’onglet, sans entrée d’historique', async () => {
    adresse.params = new URLSearchParams('onglet=deblocages');
    window.history.replaceState(null, '', '/groupe?onglet=deblocages');
    const avant = window.history.length;
    await chercher(EN_ATTENTE, ' GB_TBD.26 ');
    expect(window.location.pathname).toBe('/groupe');
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({
      onglet: 'deblocages',
      code: 'GB_TBD.26',
    });
    expect(window.history.length).toBe(avant);
  });

  it.each([
    ['un espace intérieur', 'GB TBD.26'],
    ['un signe hors « _ . - »', 'GB_TBD.26<script>'],
    ['plus de 40 caractères', 'G'.repeat(41)],
  ])('refuse un code avec %s, sans appeler le serveur', async (_cas, code) => {
    const { user } = await afficher();
    await user.type(champCode(), code);
    await user.click(boutonRechercher());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Un code ne contient que des lettres, des chiffres et les signes « _ », « . » ou « - » (40 caractères au plus).',
    );
    expect(chercherEtat).not.toHaveBeenCalled();
  });

  it('accepte un code de 40 caractères avec lettres accentuées, chiffres, « _ », « . » et « - »', async () => {
    chercherEtat.mockResolvedValueOnce(VIDE);
    const { user } = await afficher();
    const code = `ÉTÉ_2026.a-${'9'.repeat(29)}`;
    expect(code).toHaveLength(40);
    await user.type(champCode(), `${code}{Enter}`);
    expect(chercherEtat).toHaveBeenCalledWith(SLUG, code);
  });

  it('pendant une recherche, les actions sur le code affiché sont désactivées', async () => {
    const { user } = await chercher(PROJET_FERME);
    chercherEtat.mockReturnValueOnce(new Promise(() => {}));
    await user.clear(champCode());
    await user.type(champCode(), 'GB_TBD.40{Enter}');
    for (const nom of ['Ouvrir le projet', 'Modifier les cellules', 'Supprimer définitivement…']) {
      expect(screen.getByRole('button', { name: nom })).toBeDisabled();
    }
  });

  it('ne relance pas la recherche quand Next renvoie l’adresse que l’écran vient d’écrire', async () => {
    const { rerender } = await chercher(EN_ATTENTE);
    adresse.params = new URLSearchParams(window.location.search);
    rerender(<DeblocagesPanel slug={SLUG} />);
    expect(chercherEtat).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Moussa Diop')).toBeInTheDocument();
  });
});

describe('DeblocagesPanel · code porté par l’adresse', () => {
  it('cherche d’office le code de l’adresse (?code=), nettoyé, et le montre dans le champ', async () => {
    adresse.params = new URLSearchParams({ onglet: 'deblocages', code: ' GB_TBD.26 ' });
    chercherEtat.mockResolvedValueOnce(EN_ATTENTE);
    render(<DeblocagesPanel slug={SLUG} />);
    expect(await screen.findByText('Moussa Diop')).toBeInTheDocument();
    expect(chercherEtat).toHaveBeenCalledTimes(1);
    expect(chercherEtat).toHaveBeenCalledWith(SLUG, 'GB_TBD.26');
    expect(champCode()).toHaveValue('GB_TBD.26');
  });

  it('un code d’adresse mal formé n’est ni cherché ni réaffiché dans le champ', async () => {
    adresse.params = new URLSearchParams({ code: '<img src=x onerror=alert(1)>' });
    await afficher();
    expect(chercherEtat).not.toHaveBeenCalled();
    expect(champCode()).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Interventions récentes' })).toBeInTheDocument();
  });

  it('suit un nouveau lien (?code= changé) par une nouvelle recherche', async () => {
    adresse.params = new URLSearchParams('code=GB_TBD.26');
    chercherEtat.mockResolvedValueOnce(EN_ATTENTE).mockResolvedValueOnce(PERDU);
    const { rerender } = render(<DeblocagesPanel slug={SLUG} />);
    await screen.findByText('Moussa Diop');
    adresse.params = new URLSearchParams('code=GB_TBD.29');
    rerender(<DeblocagesPanel slug={SLUG} />);
    expect(await screen.findByText('Fatou Ba')).toBeInTheDocument();
    expect(chercherEtat).toHaveBeenLastCalledWith(SLUG, 'GB_TBD.29');
  });

  it('ne retient que la dernière recherche quand les réponses arrivent dans le désordre', async () => {
    const premiere = differe<EtatInterventions>();
    const seconde = differe<EtatInterventions>();
    chercherEtat.mockReturnValueOnce(premiere.promise).mockReturnValueOnce(seconde.promise);
    adresse.params = new URLSearchParams('code=GB_TBD.26');
    const { rerender } = render(<DeblocagesPanel slug={SLUG} />);
    adresse.params = new URLSearchParams('code=GB_TBD.29');
    rerender(<DeblocagesPanel slug={SLUG} />);
    await act(async () => seconde.resolve(PERDU));
    await act(async () => premiere.resolve(EN_ATTENTE));
    expect(screen.getByText('Fatou Ba')).toBeInTheDocument();
    expect(screen.queryByText('Moussa Diop')).not.toBeInTheDocument();
    expect(champCode()).toHaveValue('GB_TBD.29');
    expect(new URLSearchParams(window.location.search).get('code')).toBe('GB_TBD.29');
  });

  it('une erreur de l’ancienne recherche, arrivée après la nouvelle, n’est pas affichée', async () => {
    const premiere = differe<EtatInterventions>();
    chercherEtat.mockReturnValueOnce(premiere.promise).mockResolvedValueOnce(PERDU);
    adresse.params = new URLSearchParams('code=GB_TBD.26');
    const { rerender } = render(<DeblocagesPanel slug={SLUG} />);
    adresse.params = new URLSearchParams('code=GB_TBD.29');
    rerender(<DeblocagesPanel slug={SLUG} />);
    await screen.findByText('Fatou Ba');
    await act(async () => premiere.reject(new ApiError('Code inconnu', 404)));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Fatou Ba')).toBeInTheDocument();
  });
});

describe('DeblocagesPanel · code introuvable et erreurs', () => {
  it('code introuvable : message avec le code cherché et aide sur la forme du code', async () => {
    chercherEtat.mockResolvedValueOnce(VIDE);
    const { user } = await afficher();
    await user.type(champCode(), 'GB_XXX.99{Enter}');
    expect(
      await screen.findByText(/Aucun dossier ni projet avec le code/, { selector: '.empty-state' }),
    ).toHaveTextContent('Aucun dossier ni projet avec le code « GB_XXX.99 ».');
    expect(
      screen.getByText(/Vérifiez le code tel qu’il figure sur le dossier \(ex\. GB_TBD\.26\)/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dossier CRM' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Zone dangereuse' })).not.toBeInTheDocument();
  });

  it('refus métier (< 500) : affiche le texte du serveur', async () => {
    chercherEtat.mockRejectedValueOnce(new ApiError('Le code ne peut pas dépasser 40 caractères.', 400));
    const { user } = await afficher();
    await user.type(champCode(), 'GB{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Le code ne peut pas dépasser 40 caractères.');
  });

  it('panne du serveur (≥ 500) : message humain, jamais le texte brut', async () => {
    chercherEtat.mockRejectedValueOnce(new ApiError('Internal server error', 500));
    const { user } = await afficher();
    await user.type(champCode(), 'GB{Enter}');
    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('La recherche n’a pas abouti. Vérifiez votre connexion, puis réessayez.');
    expect(alerte).not.toHaveTextContent('Internal server error');
  });

  it('coupure réseau : même message humain, et le bouton redevient utilisable', async () => {
    chercherEtat.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { user } = await afficher();
    await user.type(champCode(), 'GB{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La recherche n’a pas abouti. Vérifiez votre connexion, puis réessayez.',
    );
    expect(boutonRechercher()).toBeEnabled();
  });

  it('une nouvelle recherche réussie efface l’erreur précédente', async () => {
    chercherEtat.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(EN_ATTENTE);
    const { user } = await afficher();
    await user.type(champCode(), 'GB_TBD.26{Enter}');
    await screen.findByRole('alert');
    await user.click(boutonRechercher());
    await screen.findByText('Moussa Diop');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// --- Interventions récentes -------------------------------------------------

describe('DeblocagesPanel · interventions récentes', () => {
  it('lit le journal d’audit des douze derniers mois (horloge figée)', async () => {
    await afficher();
    expect(chargerJournal).toHaveBeenCalledWith(SLUG, '2025-11-09', '2026-11-08');
  });

  it('indique le chargement tant que le journal n’est pas lu', () => {
    chargerJournal.mockReturnValue(new Promise(() => {}));
    render(<DeblocagesPanel slug={SLUG} />);
    expect(screen.getByLabelText('Chargement des interventions récentes')).toHaveAttribute('aria-busy', 'true');
  });

  it('liste les déblocages récents (code, nature, auteur, date, motif) sans les bascules de modules', async () => {
    chargerJournal.mockResolvedValue({
      ...JOURNAL_VIDE,
      lignes: [
        ligne('L1', 'Dossier perdu rouvert', 'GB_TBD.29 · motif : Client revenu'),
        ligne('L2', 'Module désactivé', 'finances · Finances désactivé · motif : Clôture'),
        ligne('L3', 'Onboard sans signature du client', 'GB_TBD.26 · Onboard · motif : Client en voyage', {
          le: '2026-11-06T14:05:00.000Z',
          par: null,
        }),
      ],
    });
    await afficher();
    const recents = within(screen.getByRole('region', { name: 'Interventions récentes' }));
    const boutons = recents.getAllByRole('button');
    expect(boutons).toHaveLength(2);
    expect(boutons[0]).toHaveTextContent('GB_TBD.29');
    expect(boutons[0]).toHaveTextContent('Dossier rouvert');
    expect(boutons[0]).toHaveTextContent('Awa Sarr · le 07/11/2026 à 10:00');
    expect(boutons[0]).toHaveTextContent('« Client revenu »');
    expect(boutons[1]).toHaveTextContent('GB_TBD.26');
    expect(boutons[1]).toHaveTextContent('Onboard débloqué');
    expect(boutons[1]).toHaveTextContent('Auteur inconnu · le 06/11/2026 à 14:05');
    expect(recents.queryByText(/finances/)).not.toBeInTheDocument();
  });

  it('un clic sur une intervention récente cherche son code', async () => {
    chargerJournal.mockResolvedValue({
      ...JOURNAL_VIDE,
      lignes: [ligne('L1', 'Dossier perdu rouvert', 'GB_TBD.29 · motif : Client revenu')],
    });
    chercherEtat.mockResolvedValueOnce(PERDU);
    const { user } = await afficher();
    await user.click(screen.getByRole('button', { name: /GB_TBD\.29/ }));
    expect(chercherEtat).toHaveBeenCalledWith(SLUG, 'GB_TBD.29');
    expect(await screen.findByText('Fatou Ba')).toBeInTheDocument();
    // Une fois un code affiché, la liste des récentes laisse la place.
    expect(screen.queryByRole('region', { name: 'Interventions récentes' })).not.toBeInTheDocument();
  });

  it('aucune intervention sur douze mois : invite à chercher un code', async () => {
    await afficher();
    expect(
      screen.getByText('Aucune intervention ces douze derniers mois. Cherchez un code pour commencer.'),
    ).toBeInTheDocument();
  });

  it('échec de lecture du journal : dit indisponible (pas « aucune intervention »), sans alerte', async () => {
    chargerJournal.mockRejectedValue(new ApiError('Forbidden resource', 403));
    await afficher();
    expect(
      screen.getByText('Les interventions récentes n’ont pas pu être chargées. Vous pouvez chercher un code.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Aucune intervention ces douze derniers mois/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// --- Cartes et actions ------------------------------------------------------

describe('DeblocagesPanel · cartes et actions disponibles', () => {
  it('offre acceptée sans projet : propose l’Onboard et montre les faits du dossier', async () => {
    await chercher(EN_ATTENTE);
    const carte = within(screen.getByRole('article', { name: 'Dossier CRM' }));
    expect(carte.getByText('Offre envoyée')).toBeInTheDocument();
    expect(carte.getByText('GB_TBD.26')).toBeInTheDocument();
    expect(carte.getByRole('button', { name: 'Passer en Onboard (offre acceptée)' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
    expect(carte.queryByRole('button', { name: 'Rouvrir le dossier perdu' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('article', { name: 'Projet' })).getByText(
        'Pas encore de projet : il naît à l’Onboard du dossier.',
      ),
    ).toBeInTheDocument();
  });

  it('offre envoyée mais pas encore acceptée : pas d’Onboard, une note l’explique', async () => {
    await chercher({ ...EN_ATTENTE, dossier: { ...EN_ATTENTE.dossier!, offreAcceptee: false } });
    expect(screen.queryByRole('button', { name: 'Passer en Onboard (offre acceptée)' })).not.toBeInTheDocument();
    expect(screen.getByText('L’Onboard attend une offre acceptée par le client.')).toBeInTheDocument();
  });

  it('offre acceptée mais projet déjà créé : pas d’Onboard', async () => {
    await chercher({
      ...PROJET_FERME,
      dossier: { ...PROJET_FERME.dossier!, statut: 'offre_envoyee', contratSigne: false },
    });
    expect(screen.queryByRole('button', { name: 'Passer en Onboard (offre acceptée)' })).not.toBeInTheDocument();
  });

  it('dossier dans un autre statut (nouveau projet) : ni Onboard ni réouverture', async () => {
    await chercher({ ...EN_ATTENTE, dossier: { ...EN_ATTENTE.dossier!, statut: 'nouveau_projet' } });
    expect(screen.queryByRole('button', { name: 'Passer en Onboard (offre acceptée)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rouvrir le dossier perdu' })).not.toBeInTheDocument();
  });

  it('dossier perdu : propose la réouverture, pas l’Onboard', async () => {
    await chercher(PERDU);
    expect(screen.getByRole('button', { name: 'Rouvrir le dossier perdu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passer en Onboard (offre acceptée)' })).not.toBeInTheDocument();
    expect(screen.getByText('Perdu')).toBeInTheDocument();
  });

  it('projet pas encore ouvert avec gabarit : propose l’ouverture et la modification des cellules', async () => {
    await chercher(PROJET_FERME);
    const carte = within(screen.getByRole('article', { name: 'Projet' }));
    expect(carte.getByText('Pas encore ouvert')).toBeInTheDocument();
    expect(carte.getByText('Cellule Almadies')).toBeInTheDocument();
    expect(carte.getByRole('button', { name: 'Ouvrir le projet' })).toBeInTheDocument();
    expect(carte.getByRole('button', { name: 'Modifier les cellules' })).toBeInTheDocument();
  });

  it('projet sans gabarit pour sa catégorie : pas d’ouverture, une note l’explique', async () => {
    await chercher({ ...PROJET_FERME, projet: { ...PROJET_FERME.projet!, gabarit: false } });
    expect(screen.queryByRole('button', { name: 'Ouvrir le projet' })).not.toBeInTheDocument();
    expect(screen.getByText('Pas de gabarit pour la catégorie de ce projet : il ne s’ouvre pas.')).toBeInTheDocument();
  });

  it('projet déjà ouvert : J1 affiché, ni ouverture ni note, cellules toujours modifiables', async () => {
    await chercher({
      ...PROJET_FERME,
      projet: { ...PROJET_FERME.projet!, ouvertLe: '2026-11-03T08:00:00.000Z', cellules: [] },
    });
    const carte = within(screen.getByRole('article', { name: 'Projet' }));
    expect(carte.getByText('Ouvert, J1 le 03/11/2026')).toBeInTheDocument();
    expect(carte.getByText('Aucune')).toBeInTheDocument();
    expect(carte.queryByRole('button', { name: 'Ouvrir le projet' })).not.toBeInTheDocument();
    expect(carte.queryByText(/Pas de gabarit/)).not.toBeInTheDocument();
    expect(carte.getByRole('button', { name: 'Modifier les cellules' })).toBeInTheDocument();
  });

  it('projet sans dossier CRM : la carte dossier l’explique et la zone dangereuse vise « le projet »', async () => {
    await chercher(
      sansDossier({ id: 'P9', code: 'GB_OLD.12', ouvertLe: null, gabarit: true, cellules: [] }),
      'GB_OLD.12',
    );
    expect(screen.getByText('Aucun dossier CRM avec ce code (projet antérieur au CRM).')).toBeInTheDocument();
    const zone = within(screen.getByRole('region', { name: 'Zone dangereuse' }));
    expect(zone.getByText(/Supprimer définitivement le projet/)).toBeInTheDocument();
    expect(zone.getByText('GB_OLD.12')).toBeInTheDocument();
  });

  it('dossier et projet : la zone dangereuse vise « le dossier et son projet »', async () => {
    await chercher(PROJET_FERME);
    expect(
      within(screen.getByRole('region', { name: 'Zone dangereuse' })).getByText(
        /Supprimer définitivement le dossier et son projet/,
      ),
    ).toBeInTheDocument();
  });
});

// --- Fenêtre d'intervention -------------------------------------------------

describe('DeblocagesPanel · fenêtre d’intervention', () => {
  it('place le focus sur le motif, relié à son aide par aria-describedby', async () => {
    const { user } = await chercher(EN_ATTENTE);
    const fenetre = await ouvrirFenetre(
      user,
      'Passer en Onboard (offre acceptée)',
      'Passer en Onboard (offre acceptée)',
    );
    const motif = within(fenetre).getByRole('textbox', { name: 'Motif' });
    expect(motif).toHaveFocus();
    expect(within(fenetre).getByText(/Code visé/)).toHaveTextContent('Code visé : GB_TBD.26');
    expect(motif).toHaveAttribute('aria-describedby', 'deb-motif-aide');
    expect(motif).toHaveAccessibleDescription('Obligatoire, 3 caractères au moins. Inscrit au journal d’audit.');
  });

  it('exige un motif d’au moins 3 caractères hors espaces autour', async () => {
    const { user } = await chercher(EN_ATTENTE);
    const fenetre = await ouvrirFenetre(
      user,
      'Passer en Onboard (offre acceptée)',
      'Passer en Onboard (offre acceptée)',
    );
    const envoyer = within(fenetre).getByRole('button', { name: 'Passer en Onboard' });
    const motif = within(fenetre).getByRole('textbox', { name: 'Motif' });
    expect(envoyer).toBeDisabled();
    await user.type(motif, '  ab    ');
    expect(envoyer).toBeDisabled();
    await user.clear(motif);
    await user.type(motif, 'abc');
    expect(envoyer).toBeEnabled();
  });

  it('Entrée avec un motif trop court n’envoie rien', async () => {
    const { user } = await chercher(EN_ATTENTE);
    const fenetre = await ouvrirFenetre(
      user,
      'Passer en Onboard (offre acceptée)',
      'Passer en Onboard (offre acceptée)',
    );
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'ab{Enter}');
    expect(onboarder).not.toHaveBeenCalled();
  });

  it('Onboard : envoie l’identifiant du dossier et le motif nettoyé, puis confirme et met l’écran à jour', async () => {
    onboarder.mockResolvedValueOnce({
      ...PROJET_FERME,
      dossier: { ...EN_ATTENTE.dossier!, statut: 'onboard' },
      projet: { ...PROJET_FERME.projet!, code: 'GB_TBD.26', ouvertLe: '2026-11-08T10:00:00.000Z' },
    });
    const { user } = await chercher(EN_ATTENTE);
    const fenetre = await ouvrirFenetre(
      user,
      'Passer en Onboard (offre acceptée)',
      'Passer en Onboard (offre acceptée)',
    );
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), '  Client en voyage  ');
    await user.click(within(fenetre).getByRole('button', { name: 'Passer en Onboard' }));
    expect(onboarder).toHaveBeenCalledWith(SLUG, 'D1', 'Client en voyage');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(
      'GB_TBD.26 passé en Onboard. Intervention inscrite au journal d’audit.',
    );
    expect(screen.getByText('Ouvert, J1 le 08/11/2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passer en Onboard (offre acceptée)' })).not.toBeInTheDocument();
  });

  it('pendant l’envoi : libellé d’attente, Échap, Annuler et Fermer sans effet', async () => {
    const reponse = differe<EtatInterventions>();
    onboarder.mockReturnValueOnce(reponse.promise);
    const { user } = await chercher(EN_ATTENTE);
    const fenetre = await ouvrirFenetre(
      user,
      'Passer en Onboard (offre acceptée)',
      'Passer en Onboard (offre acceptée)',
    );
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Client en voyage');
    await user.click(within(fenetre).getByRole('button', { name: 'Passer en Onboard' }));
    expect(within(fenetre).getByRole('button', { name: 'Passage en Onboard…' })).toBeDisabled();
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(within(fenetre).getByRole('button', { name: 'Fermer' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Passer en Onboard (offre acceptée)' })).toBeInTheDocument();
    await act(async () => reponse.resolve({ ...EN_ATTENTE, dossier: { ...EN_ATTENTE.dossier!, statut: 'onboard' } }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Échap ferme la fenêtre hors envoi et rend le focus au bouton qui l’a ouverte', async () => {
    const { user } = await chercher(PERDU);
    await ouvrirFenetre(user, 'Rouvrir le dossier perdu', 'Rouvrir le dossier perdu');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rouvrir le dossier perdu' })).toHaveFocus());
    expect(rouvrir).not.toHaveBeenCalled();
  });

  it('refus du serveur (< 500) : texte du serveur affiché, fenêtre gardée, motif conservé', async () => {
    rouvrir.mockRejectedValueOnce(new ApiError('Le dossier n’est plus perdu.', 409));
    const { user } = await chercher(PERDU);
    const fenetre = await ouvrirFenetre(user, 'Rouvrir le dossier perdu', 'Rouvrir le dossier perdu');
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Client revenu');
    await user.click(within(fenetre).getByRole('button', { name: 'Rouvrir le dossier' }));
    expect(await within(fenetre).findByRole('alert')).toHaveTextContent('Le dossier n’est plus perdu.');
    expect(screen.getByRole('dialog', { name: 'Rouvrir le dossier perdu' })).toBeInTheDocument();
    expect(within(fenetre).getByRole('textbox', { name: 'Motif' })).toHaveValue('Client revenu');
    expect(within(fenetre).getByRole('button', { name: 'Rouvrir le dossier' })).toBeEnabled();
    expect(screen.getByRole('status')).not.toHaveTextContent(/rouvert/);
  });

  it('panne du serveur (≥ 500) ou réseau : message humain dans la fenêtre', async () => {
    rouvrir.mockRejectedValueOnce(new ApiError('Internal server error', 503)).mockRejectedValueOnce(new TypeError('x'));
    const { user } = await chercher(PERDU);
    const fenetre = await ouvrirFenetre(user, 'Rouvrir le dossier perdu', 'Rouvrir le dossier perdu');
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Client revenu');
    const humain = 'L’intervention n’a pas été enregistrée. Rien n’a changé ; réessayez dans un instant.';
    await user.click(within(fenetre).getByRole('button', { name: 'Rouvrir le dossier' }));
    expect(await within(fenetre).findByRole('alert')).toHaveTextContent(humain);
    expect(within(fenetre).getByRole('alert')).not.toHaveTextContent('Internal server error');
    await user.click(within(fenetre).getByRole('button', { name: 'Rouvrir le dossier' }));
    await waitFor(() => expect(rouvrir).toHaveBeenCalledTimes(2));
    expect(await within(fenetre).findByRole('alert')).toHaveTextContent(humain);
  });

  it('réouverture : appelle rouvrirDossier avec l’identifiant du dossier, puis confirme', async () => {
    rouvrir.mockResolvedValueOnce({ ...PERDU, dossier: { ...PERDU.dossier!, statut: 'nouveau_projet' } });
    const { user } = await chercher(PERDU);
    const fenetre = await ouvrirFenetre(user, 'Rouvrir le dossier perdu', 'Rouvrir le dossier perdu');
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Client revenu');
    await user.click(within(fenetre).getByRole('button', { name: 'Rouvrir le dossier' }));
    expect(rouvrir).toHaveBeenCalledWith(SLUG, 'D2', 'Client revenu');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'GB_TBD.29 rouvert. Intervention inscrite au journal d’audit.',
    );
    expect(screen.getByText('Nouveau projet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rouvrir le dossier perdu' })).not.toBeInTheDocument();
  });

  it('ouverture du projet : appelle ouvrirProjet avec l’identifiant du projet', async () => {
    ouvrirP.mockResolvedValueOnce({
      ...PROJET_FERME,
      projet: { ...PROJET_FERME.projet!, ouvertLe: '2026-11-08T10:00:00.000Z' },
    });
    const { user } = await chercher(PROJET_FERME);
    const fenetre = await ouvrirFenetre(user, 'Ouvrir le projet', 'Ouvrir le projet');
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Onboard antérieur');
    await user.click(within(fenetre).getByRole('button', { name: 'Ouvrir le projet' }));
    expect(ouvrirP).toHaveBeenCalledWith(SLUG, 'P1', 'Onboard antérieur');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'GB_TBD.27 ouvert. Intervention inscrite au journal d’audit.',
    );
  });
});

// --- Confirmation de succès -------------------------------------------------

describe('DeblocagesPanel · confirmation de succès', () => {
  it('est annoncée (role=status) et visible à l’écran', async () => {
    rouvrir.mockResolvedValueOnce({ ...PERDU, dossier: { ...PERDU.dossier!, statut: 'nouveau_projet' } });
    const { user } = await chercher(PERDU);
    const fenetre = await ouvrirFenetre(user, 'Rouvrir le dossier perdu', 'Rouvrir le dossier perdu');
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Client revenu');
    await user.click(within(fenetre).getByRole('button', { name: 'Rouvrir le dossier' }));
    const texte = 'GB_TBD.29 rouvert. Intervention inscrite au journal d’audit.';
    const statut = await screen.findByRole('status');
    expect(statut).toHaveTextContent(texte);
    expect(statut).toHaveAttribute('aria-live', 'polite');
    // Une copie hors de la région lue par les lecteurs d'écran : la version visible.
    const visibles = screen.getAllByText(texte).filter((el) => el !== statut);
    expect(visibles).toHaveLength(1);
  });

  it('disparaît à la recherche suivante', async () => {
    rouvrir.mockResolvedValueOnce({ ...PERDU, dossier: { ...PERDU.dossier!, statut: 'nouveau_projet' } });
    const { user } = await chercher(PERDU);
    const fenetre = await ouvrirFenetre(user, 'Rouvrir le dossier perdu', 'Rouvrir le dossier perdu');
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Client revenu');
    await user.click(within(fenetre).getByRole('button', { name: 'Rouvrir le dossier' }));
    await screen.findByText('Nouveau projet');
    chercherEtat.mockResolvedValueOnce(EN_ATTENTE);
    await user.clear(champCode());
    await user.type(champCode(), 'GB_TBD.26{Enter}');
    await screen.findByText('Moussa Diop');
    // L'annonce laisse place au résultat de la nouvelle recherche.
    expect(screen.getByRole('status')).not.toHaveTextContent(/rouvert/);
    expect(screen.queryByText(/rouvert\. Intervention inscrite/)).not.toBeInTheDocument();
  });
});

// --- Cellules ---------------------------------------------------------------

describe('DeblocagesPanel · cellules du projet', () => {
  it('coche les cellules actuelles du projet parmi celles de la société', async () => {
    const { user } = await chercher(PROJET_FERME);
    const fenetre = await ouvrirFenetre(user, 'Modifier les cellules', 'Cellules du projet');
    expect(within(fenetre).getByRole('checkbox', { name: /Cellule Almadies/ })).toBeChecked();
    expect(within(fenetre).getByRole('checkbox', { name: /Cellule Plateau/ })).not.toBeChecked();
  });

  it('envoie les identifiants des cellules cochées avec le motif', async () => {
    changerCellules.mockResolvedValueOnce({
      ...PROJET_FERME,
      projet: { ...PROJET_FERME.projet!, cellules: [CEL_B] },
    });
    const { user } = await chercher(PROJET_FERME);
    const fenetre = await ouvrirFenetre(user, 'Modifier les cellules', 'Cellules du projet');
    await user.click(within(fenetre).getByRole('checkbox', { name: /Cellule Almadies/ }));
    await user.click(within(fenetre).getByRole('checkbox', { name: /Cellule Plateau/ }));
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Réorganisation');
    await user.click(within(fenetre).getByRole('button', { name: 'Enregistrer les cellules' }));
    expect(changerCellules).toHaveBeenCalledWith(SLUG, 'P1', ['c2'], 'Réorganisation');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'GB_TBD.27 mis à jour (cellules). Intervention inscrite au journal d’audit.',
    );
    expect(within(screen.getByRole('article', { name: 'Projet' })).getByText('Cellule Plateau')).toBeInTheDocument();
  });

  it('tout décocher envoie une liste vide', async () => {
    changerCellules.mockResolvedValueOnce({ ...PROJET_FERME, projet: { ...PROJET_FERME.projet!, cellules: [] } });
    const { user } = await chercher(PROJET_FERME);
    const fenetre = await ouvrirFenetre(user, 'Modifier les cellules', 'Cellules du projet');
    await user.click(within(fenetre).getByRole('checkbox', { name: /Cellule Almadies/ }));
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Plus de cellule');
    await user.click(within(fenetre).getByRole('button', { name: 'Enregistrer les cellules' }));
    expect(changerCellules).toHaveBeenCalledWith(SLUG, 'P1', [], 'Plus de cellule');
  });

  it('société sans cellule : la fenêtre renvoie vers Équipes', async () => {
    const { user } = await chercher({ ...PROJET_FERME, cellulesDisponibles: [] });
    const fenetre = await ouvrirFenetre(user, 'Modifier les cellules', 'Cellules du projet');
    expect(within(fenetre).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      within(fenetre).getByText('Aucune cellule dans cette société : créez-les dans Équipes.'),
    ).toBeInTheDocument();
  });
});

// --- Suppression définitive -------------------------------------------------

describe('DeblocagesPanel · suppression définitive', () => {
  const ouvrirSuppression = async (user: ReturnType<typeof userEvent.setup>) =>
    ouvrirFenetre(user, 'Supprimer définitivement…', 'Supprimer définitivement');

  it('exige le code retapé à l’identique en plus du motif', async () => {
    const { user } = await chercher(EN_ATTENTE);
    const fenetre = await ouvrirSuppression(user);
    const envoyer = within(fenetre).getByRole('button', { name: 'Supprimer définitivement' });
    const confirmation = within(fenetre).getByRole('textbox', { name: 'Retapez GB_TBD.26 pour confirmer' });
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Doublon');
    expect(envoyer).toBeDisabled();
    await user.type(confirmation, 'gb_tbd.26');
    expect(envoyer).toBeDisabled();
    await user.clear(confirmation);
    await user.type(confirmation, 'GB_TBD.2');
    expect(envoyer).toBeDisabled();
    await user.type(confirmation, '6');
    expect(envoyer).toBeEnabled();
  });

  it('code correct mais motif trop court : toujours bloqué', async () => {
    const { user } = await chercher(EN_ATTENTE);
    const fenetre = await ouvrirSuppression(user);
    await user.type(within(fenetre).getByRole('textbox', { name: 'Retapez GB_TBD.26 pour confirmer' }), 'GB_TBD.26');
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'ab');
    expect(within(fenetre).getByRole('button', { name: 'Supprimer définitivement' })).toBeDisabled();
  });

  it('supprime par le code, confirme « … supprimé définitivement » sans afficher « Aucun dossier »', async () => {
    supprimer.mockResolvedValueOnce({
      ...VIDE,
      historique: [
        {
          id: 'H1',
          type: 'suppression',
          detail: 'Dossier et projet',
          motif: 'Doublon',
          par: 'Awa Sarr',
          le: '2026-11-08T10:00:00.000Z',
        },
      ],
    });
    const { user } = await chercher(EN_ATTENTE);
    const fenetre = await ouvrirSuppression(user);
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), ' Doublon ');
    await user.type(within(fenetre).getByRole('textbox', { name: 'Retapez GB_TBD.26 pour confirmer' }), 'GB_TBD.26');
    await user.click(within(fenetre).getByRole('button', { name: 'Supprimer définitivement' }));
    expect(supprimer).toHaveBeenCalledWith(SLUG, 'GB_TBD.26', 'Doublon');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'GB_TBD.26 supprimé définitivement. La trace reste au journal d’audit.',
    );
    expect(screen.queryByText(/Aucun dossier ni projet/, { selector: '.empty-state' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Zone dangereuse' })).not.toBeInTheDocument();
    expect(screen.getByText('Supprimé définitivement')).toBeInTheDocument();
    // Le bouton déclencheur n'existe plus : le focus revient au champ de recherche.
    await waitFor(() => expect(champCode()).toHaveFocus());
  });

  it('recherche du même code après suppression : « Aucun dossier » réapparaît', async () => {
    supprimer.mockResolvedValueOnce(VIDE);
    const { user } = await chercher(EN_ATTENTE);
    const fenetre = await ouvrirSuppression(user);
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Doublon');
    await user.type(within(fenetre).getByRole('textbox', { name: 'Retapez GB_TBD.26 pour confirmer' }), 'GB_TBD.26');
    await user.click(within(fenetre).getByRole('button', { name: 'Supprimer définitivement' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/supprimé définitivement\. La trace reste/);
    chercherEtat.mockResolvedValueOnce(VIDE);
    await user.click(boutonRechercher());
    expect(
      await screen.findByText(/Aucun dossier ni projet avec le code/, { selector: '.empty-state' }),
    ).toHaveTextContent('Aucun dossier ni projet avec le code « GB_TBD.26 ».');
  });
});

// --- Historique -------------------------------------------------------------

describe('DeblocagesPanel · historique du code', () => {
  it('liste les interventions avec libellé, détail, motif et « auteur · le … à … »', async () => {
    await chercher({
      ...PROJET_FERME,
      historique: [
        {
          id: 'H1',
          type: 'onboard_sans_signature',
          detail: 'Onboard',
          motif: 'Client en voyage',
          par: 'Awa Sarr',
          le: '2026-11-06T14:05:00.000Z',
        },
        {
          id: 'H2',
          type: 'cellules_projet',
          detail: '',
          motif: 'Réorganisation',
          par: null,
          le: '2026-11-07T23:30:00.000Z',
        },
      ],
    });
    const historique = within(screen.getByRole('region', { name: 'Interventions sur ce code' }));
    const items = historique.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Onboard débloqué · Onboard');
    expect(items[0]).toHaveTextContent('Motif : « Client en voyage »');
    expect(items[0]).toHaveTextContent('Awa Sarr · le 06/11/2026 à 14:05');
    expect(items[1]).toHaveTextContent('Cellules modifiées');
    expect(items[1]).not.toHaveTextContent('Cellules modifiées ·');
    // Dakar = UTC : 23h30 reste le 7, quel que soit le fuseau de l'appareil.
    expect(items[1]).toHaveTextContent('Auteur inconnu · le 07/11/2026 à 23:30');
  });

  it('pas d’historique : pas de section', async () => {
    await chercher(EN_ATTENTE);
    expect(screen.queryByRole('heading', { name: 'Interventions sur ce code' })).not.toBeInTheDocument();
  });
});

// --- Cible de l'intervention ------------------------------------------------

describe('DeblocagesPanel · cible de l’intervention', () => {
  it('une recherche qui aboutit fenêtre ouverte (lien suivi) ne change pas le dossier visé', async () => {
    adresse.params = new URLSearchParams('code=GB_TBD.26');
    chercherEtat.mockResolvedValueOnce(EN_ATTENTE);
    const user = userEvent.setup();
    const { rerender } = render(<DeblocagesPanel slug={SLUG} />);
    await screen.findByText('Moussa Diop');
    const fenetre = await ouvrirFenetre(
      user,
      'Passer en Onboard (offre acceptée)',
      'Passer en Onboard (offre acceptée)',
    );
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Client en voyage');
    // L'adresse change (Précédent, lien) : GB_TBD.40, aussi en attente d'Onboard, répond fenêtre ouverte.
    chercherEtat.mockResolvedValueOnce({
      ...EN_ATTENTE,
      dossier: { ...EN_ATTENTE.dossier!, id: 'D40', code: 'GB_TBD.40' },
    });
    adresse.params = new URLSearchParams('code=GB_TBD.40');
    rerender(<DeblocagesPanel slug={SLUG} />);
    await waitFor(() => expect(chercherEtat).toHaveBeenLastCalledWith(SLUG, 'GB_TBD.40'));
    await screen.findByText('GB_TBD.40', { selector: '.deb-carte .deb-code' });
    expect(within(fenetre).getByText(/Code visé/)).toHaveTextContent('Code visé : GB_TBD.26');
    onboarder.mockResolvedValueOnce(EN_ATTENTE);
    await user.click(within(fenetre).getByRole('button', { name: 'Passer en Onboard' }));
    expect(onboarder).toHaveBeenCalledWith(SLUG, 'D1', 'Client en voyage');
    expect(await screen.findByRole('status')).toHaveTextContent('GB_TBD.26 passé en Onboard.');
  });

  it('après l’intervention, le champ, l’adresse et les cartes désignent le même code', async () => {
    adresse.params = new URLSearchParams('code=GB_TBD.26');
    chercherEtat.mockResolvedValueOnce(EN_ATTENTE);
    const user = userEvent.setup();
    const { rerender } = render(<DeblocagesPanel slug={SLUG} />);
    await screen.findByText('Moussa Diop');
    const fenetre = await ouvrirFenetre(
      user,
      'Passer en Onboard (offre acceptée)',
      'Passer en Onboard (offre acceptée)',
    );
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Client en voyage');
    chercherEtat.mockResolvedValueOnce(PERDU);
    adresse.params = new URLSearchParams('code=GB_TBD.29');
    rerender(<DeblocagesPanel slug={SLUG} />);
    await screen.findByText('Fatou Ba');
    onboarder.mockResolvedValueOnce({ ...EN_ATTENTE, dossier: { ...EN_ATTENTE.dossier!, statut: 'onboard' } });
    await user.click(within(fenetre).getByRole('button', { name: 'Passer en Onboard' }));
    await screen.findByRole('status');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const codeCarte = screen.getAllByText(/^GB_TBD\./, { selector: '.deb-carte .deb-code' })[0].textContent;
    expect(champCode()).toHaveValue(codeCarte);
    expect(new URLSearchParams(window.location.search).get('code')).toBe(codeCarte);
  });

  it('suppression : le code à retaper reste celui de la fenêtre ouverte', async () => {
    adresse.params = new URLSearchParams('code=GB_TBD.26');
    chercherEtat.mockResolvedValueOnce(EN_ATTENTE);
    const user = userEvent.setup();
    const { rerender } = render(<DeblocagesPanel slug={SLUG} />);
    await screen.findByText('Moussa Diop');
    const fenetre = await ouvrirFenetre(user, 'Supprimer définitivement…', 'Supprimer définitivement');
    chercherEtat.mockResolvedValueOnce(PERDU);
    adresse.params = new URLSearchParams('code=GB_TBD.29');
    rerender(<DeblocagesPanel slug={SLUG} />);
    await screen.findByText('Fatou Ba');
    await user.type(within(fenetre).getByRole('textbox', { name: 'Motif' }), 'Doublon');
    await user.type(within(fenetre).getByRole('textbox', { name: 'Retapez GB_TBD.26 pour confirmer' }), 'GB_TBD.26');
    supprimer.mockResolvedValueOnce(VIDE);
    await user.click(within(fenetre).getByRole('button', { name: 'Supprimer définitivement' }));
    expect(supprimer).toHaveBeenCalledWith(SLUG, 'GB_TBD.26', 'Doublon');
  });
});

describe('DeblocagesPanel · cas relevés en revue', () => {
  it('code supprimé un autre jour : le dit, au lieu de « introuvable »', async () => {
    chercherEtat.mockResolvedValueOnce({
      ...VIDE,
      historique: [
        {
          id: 'H1',
          type: 'suppression',
          detail: 'Doublon de dossier',
          motif: 'Doublon',
          par: 'Awa Sarr',
          le: '2026-11-06T14:05:00Z',
        },
      ],
    });
    const { user } = await afficher();
    await user.type(champCode(), 'GB_OLD.26');
    await user.click(boutonRechercher());
    expect(await screen.findByText(/a été supprimé définitivement/, { selector: '.deb-supprime' })).toHaveTextContent(
      'GB_OLD.26 a été supprimé définitivement (Awa Sarr · le 06/11/2026 à 14:05). Seule sa trace au journal reste.',
    );
    expect(screen.queryByText(/Aucun dossier ni projet/, { selector: '.empty-state' })).not.toBeInTheDocument();
  });

  it('ce qui est tapé pendant une recherche reste dans le champ quand elle aboutit', async () => {
    const attente = differe<EtatInterventions>();
    chercherEtat.mockReturnValueOnce(attente.promise);
    const { user } = await afficher();
    await user.type(champCode(), 'GB_TBD.26');
    await user.click(boutonRechercher());
    await user.clear(champCode());
    await user.type(champCode(), 'GB_AUT.27');
    await act(async () => attente.resolve(EN_ATTENTE));
    expect(champCode()).toHaveValue('GB_AUT.27');
  });
});
