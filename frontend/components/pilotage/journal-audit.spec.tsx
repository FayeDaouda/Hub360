import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/client-api';
import { exporterCsv } from '@/lib/export-csv';
import { getJournalAudit, type JournalAudit as Journal, type LigneAudit } from '@/lib/pilotage';
import { JournalAudit } from './journal-audit';

vi.mock('@/lib/pilotage', () => ({ getJournalAudit: vi.fn() }));
// Export Excel : on vérifie ce qui serait exporté, sans téléchargement.
vi.mock('@/lib/export-csv', () => ({ exporterCsv: vi.fn(), dateExport: (iso: string) => iso }));
// Adresse de la page : stable d'un rendu à l'autre (comme celle de Next).
const adresse = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/groupe', useSearchParams: () => adresse.params }));
const charger = vi.mocked(getJournalAudit);
const exporterMock = vi.mocked(exporterCsv);

const JOURNAL: Journal = {
  debut: '2026-01-01',
  fin: '2026-11-07',
  lignes: [
    {
      id: 'L1',
      le: '2026-11-06T10:00:00.000Z',
      categorie: 'droits',
      action: 'Matrice modifiée',
      detail: 'CFO › Finances',
      par: 'Awa Sarr',
    },
  ],
};

beforeEach(() => {
  charger.mockReset();
  exporterMock.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T10:00:00Z'));
  adresse.params = new URLSearchParams();
  window.history.replaceState(null, '', '/groupe');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('JournalAudit', () => {
  it('par défaut (Pilotage), porte son propre titre « Journal d’audit »', async () => {
    charger.mockResolvedValue(JOURNAL);
    render(<JournalAudit slug="grey-concrete" />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Journal d’audit' })).toBeInTheDocument();
    // 30 jours par défaut, comme le serveur sans dates.
    expect(charger).toHaveBeenCalledWith('grey-concrete', '2026-10-10', '2026-11-08');
  });

  it('sans en-tête (Administration du HUB), pas de h2 mais une section nommée « Journal d’audit »', async () => {
    charger.mockResolvedValue(JOURNAL);
    render(<JournalAudit slug="grey-concrete" entete={false} />);
    expect(await screen.findByRole('region', { name: 'Journal d’audit' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Journal d’audit' })).not.toBeInTheDocument();
    // Sous le h1 de la page, les jours sont des h2.
    expect(screen.getByRole('heading', { level: 2, name: 'Vendredi 6 novembre' })).toBeInTheDocument();
    expect(screen.getByText('Matrice modifiée')).toBeInTheDocument();
  });

  it('avec en-tête, la section n’a pas d’aria-label redondant avec le titre', async () => {
    charger.mockResolvedValue(JOURNAL);
    const { container } = render(<JournalAudit slug="grey-concrete" />);
    await screen.findByText('Matrice modifiée');
    expect(container.querySelector('section')).not.toHaveAttribute('aria-label');
  });

  it('en cas d’échec du chargement initial, affiche l’erreur et « Réessayer » relance le chargement', async () => {
    charger.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(JOURNAL);
    render(<JournalAudit slug="grey-concrete" entete={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Le journal n’a pas pu être chargé.');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Matrice modifiée')).toBeInTheDocument();
    expect(charger).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('accès refusé : message en français, sans « Réessayer » qui n’y changerait rien', async () => {
    charger.mockRejectedValue(new ApiError('Forbidden resource', 403));
    render(<JournalAudit slug="grey-concrete" entete={false} />);
    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Vous n’avez pas accès au journal de cette société.');
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });

  it('nombres par catégorie absents tant que la période n’est pas lue', async () => {
    charger.mockReturnValue(new Promise(() => {}));
    render(<JournalAudit slug="grey-concrete" entete={false} />);
    expect(screen.getByRole('button', { name: 'Tout' })).toBeInTheDocument();
    expect(screen.getByText('Chargement…')).toBeInTheDocument();
  });

  it('panne ou coupure réseau : message humain, jamais le texte brut du serveur', async () => {
    charger.mockRejectedValue(new ApiError('Internal server error', 500));
    render(<JournalAudit slug="grey-concrete" />);
    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Le journal n’a pas pu être chargé.');
    expect(alerte).not.toHaveTextContent('Internal server error');
  });
});

// Journal sur 30 jours (défaut) : quatre traces sur trois jours, dont une à
// 23h30 UTC (Dakar = UTC : toujours le samedi 7) et une intervention avec motif.
const FACTURE: LigneAudit = {
  id: 'R1',
  le: '2026-11-08T09:00:00.000Z',
  categorie: 'finances',
  action: 'Facture émise',
  detail: 'F2026-0001 · 1 180 000 F CFA',
  par: 'Awa Sarr',
};
const MODULE: LigneAudit = {
  id: 'R2',
  le: '2026-11-07T23:30:00.000Z',
  categorie: 'administration',
  action: 'Module désactivé',
  detail: 'crm · CRM désactivé · motif : audit interne',
  par: 'Émile Diop',
};
const REGLAGE: LigneAudit = {
  id: 'R3',
  le: '2026-11-07T08:00:00.000Z',
  categorie: 'reglages',
  action: 'Réglage modifié',
  detail: 'Délai de relance : 3 jours',
  par: 'Awa Sarr',
};
const VERROU: LigneAudit = {
  id: 'R4',
  le: '2026-11-05T10:00:00.000Z',
  categorie: 'comptes',
  action: 'Compte verrouillé',
  detail: 'Moussa Fall · trop d’essais',
  par: null,
};
const RICHE: Journal = { debut: '2026-10-10', fin: '2026-11-08', lignes: [FACTURE, MODULE, REGLAGE, VERROU] };
const ACTIONS = /^(Facture émise|Module désactivé|Réglage modifié|Compte verrouillé)$/;

const actionsAffichees = () => screen.queryAllByText(ACTIONS).map((e) => e.textContent);
const bouton = (name: string | RegExp) => screen.getByRole('button', { name });
const adresseActuelle = () => new URLSearchParams(window.location.search);

async function afficher(journal: Journal = RICHE, props: { entete?: boolean } = {}) {
  charger.mockResolvedValue(journal);
  const user = userEvent.setup();
  const vue = render(<JournalAudit slug="grey-concrete" {...props} />);
  await screen.findByRole('group', { name: 'Catégorie' });
  return { user, ...vue };
}

// Promesse résolue à la main : ordre d'arrivée des réponses du serveur.
function differee<T>() {
  let resoudre!: (v: T) => void;
  const promesse = new Promise<T>((r) => (resoudre = r));
  return { promesse, resoudre };
}

describe('JournalAudit · période', () => {
  it('« 7 jours » redemande le journal du 2 au 8 novembre et devient la période active', async () => {
    const { user } = await afficher();
    await user.click(bouton('7 jours'));
    expect(charger).toHaveBeenLastCalledWith('grey-concrete', '2026-11-02', '2026-11-08');
    expect(bouton('7 jours')).toHaveAttribute('aria-pressed', 'true');
    expect(bouton('30 jours')).toHaveAttribute('aria-pressed', 'false');
  });

  it('échec sur une autre période : ni les anciennes traces ni un blocage, « Réessayer » relance', async () => {
    charger
      .mockResolvedValueOnce(JOURNAL)
      .mockRejectedValueOnce(new ApiError('Internal server error', 500))
      .mockResolvedValueOnce(JOURNAL);
    render(<JournalAudit slug="grey-concrete" entete={false} />);
    await screen.findByText('Matrice modifiée');
    await userEvent.click(screen.getByRole('button', { name: '7 jours' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le journal n’a pas pu être chargé.');
    expect(screen.queryByText('Matrice modifiée')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Matrice modifiée')).toBeInTheDocument();
    expect(charger).toHaveBeenLastCalledWith('grey-concrete', '2026-11-02', '2026-11-08');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('« 3 mois » et « 12 mois » demandent les bonnes bornes', async () => {
    const { user } = await afficher();
    await user.click(bouton('3 mois'));
    expect(charger).toHaveBeenLastCalledWith('grey-concrete', '2026-08-09', '2026-11-08');
    await user.click(bouton('12 mois'));
    expect(charger).toHaveBeenLastCalledWith('grey-concrete', '2025-11-09', '2026-11-08');
  });

  it('« Dates… » part de la période affichée sans redemander le journal', async () => {
    const { user } = await afficher();
    await user.click(bouton('Dates…'));
    expect(screen.getByLabelText('Du')).toHaveValue('2026-10-10');
    expect(screen.getByLabelText('Au')).toHaveValue('2026-11-08');
    expect(charger).toHaveBeenCalledTimes(1);
  });

  it('des dates choisies valides sont demandées au serveur et écrites dans l’adresse', async () => {
    const { user } = await afficher();
    await user.click(bouton('Dates…'));
    const du = screen.getByLabelText('Du');
    await user.clear(du);
    await user.type(du, '2026-01-01');
    expect(charger).toHaveBeenLastCalledWith('grey-concrete', '2026-01-01', '2026-11-08');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const p = adresseActuelle();
    expect([p.get('periode'), p.get('du'), p.get('au')]).toEqual(['perso', '2026-01-01', '2026-11-08']);
  });

  it('date de début effacée : message, traces masquées et aucun appel au serveur', async () => {
    const { user } = await afficher();
    await user.click(bouton('Dates…'));
    await user.clear(screen.getByLabelText('Du'));
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez une date de début et une date de fin.');
    expect(actionsAffichees()).toEqual([]);
    expect(charger).toHaveBeenCalledTimes(1);
  });

  it('début après la fin : message et aucun appel au serveur', async () => {
    const { user } = await afficher();
    await user.click(bouton('Dates…'));
    const du = screen.getByLabelText('Du');
    await user.clear(du);
    await user.type(du, '2026-11-20');
    expect(screen.getByRole('alert')).toHaveTextContent('La date de début doit précéder la date de fin.');
    expect(charger).toHaveBeenCalledTimes(1);
  });

  it('plus d’un an : message et aucun appel au serveur', async () => {
    const { user } = await afficher();
    await user.click(bouton('Dates…'));
    const du = screen.getByLabelText('Du');
    await user.clear(du);
    await user.type(du, '2025-01-01');
    expect(screen.getByRole('alert')).toHaveTextContent('Un an au plus par consultation');
    expect(charger).toHaveBeenCalledTimes(1);
  });

  it('lien partagé avec des dates invalides : outils et message tout de suite, sans appel au serveur', async () => {
    adresse.params = new URLSearchParams('periode=perso&du=2026-12-01&au=2026-11-01');
    window.history.replaceState(null, '', '/groupe?periode=perso&du=2026-12-01&au=2026-11-01');
    render(<JournalAudit slug="grey-concrete" />);
    expect(screen.getByRole('alert')).toHaveTextContent('La date de début doit précéder la date de fin.');
    expect(bouton('Dates…')).toHaveAttribute('aria-pressed', 'true');
    expect(charger).not.toHaveBeenCalled();
  });

  it('seule la dernière période demandée s’affiche, même si une réponse plus ancienne arrive après', async () => {
    const { user } = await afficher();
    const lente = differee<Journal>();
    charger.mockReturnValueOnce(lente.promesse).mockResolvedValueOnce({ ...RICHE, lignes: [VERROU] });
    await user.click(bouton('7 jours'));
    await user.click(bouton('3 mois'));
    expect(await screen.findByText('1 trace · du 10/10/2026 au 08/11/2026')).toBeInTheDocument();
    // act : la réponse tardive est traitée et rendue avant la vérification.
    await act(async () => {
      lente.resoudre({ ...RICHE, lignes: [FACTURE] });
      await lente.promesse;
    });
    expect(actionsAffichees()).toEqual(['Compte verrouillé']);
  });
});

describe('JournalAudit · filtres et compteurs', () => {
  it('compte les traces par catégorie, « Tout » compris', async () => {
    await afficher();
    expect(bouton('Tout 4')).toHaveAttribute('aria-pressed', 'true');
    expect(bouton('Finances 1')).toBeInTheDocument();
    expect(bouton('Administration 1')).toBeInTheDocument();
    expect(bouton('Paie 0')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('4 traces · du 10/10/2026 au 08/11/2026');
  });

  it('une catégorie ne garde que ses traces ; les compteurs restent ceux de toutes les catégories', async () => {
    const { user } = await afficher();
    await user.click(bouton('Finances 1'));
    expect(actionsAffichees()).toEqual(['Facture émise']);
    expect(bouton('Finances 1')).toHaveAttribute('aria-pressed', 'true');
    expect(bouton('Tout 4')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('1 trace sur 4');
    // La catégorie se lit côté client : pas de nouvel appel.
    expect(charger).toHaveBeenCalledTimes(1);
  });

  it('la liste des auteurs suit l’ordre alphabétique, le HUB en dernier', async () => {
    await afficher();
    const options = within(screen.getByRole('combobox', { name: 'Auteur' })).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Tout le monde', 'Awa Sarr', 'Émile Diop', 'le HUB']);
  });

  it('« le HUB » ne garde que les traces sans auteur et met les compteurs à jour', async () => {
    const { user } = await afficher();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Auteur' }), 'le HUB');
    expect(actionsAffichees()).toEqual(['Compte verrouillé']);
    expect(bouton('Tout 1')).toBeInTheDocument();
    expect(bouton('Finances 0')).toBeInTheDocument();
    expect(bouton('Comptes 1')).toBeInTheDocument();
  });

  it('la recherche ignore les accents et cherche aussi le nom de l’auteur', async () => {
    const { user } = await afficher();
    const recherche = screen.getByRole('searchbox', { name: 'Rechercher dans le journal' });
    await user.type(recherche, 'reglage');
    expect(actionsAffichees()).toEqual(['Réglage modifié']);
    await user.clear(recherche);
    await user.type(recherche, 'emile');
    expect(actionsAffichees()).toEqual(['Module désactivé']);
  });

  it('la recherche trouve une trace par le nom de sa catégorie', async () => {
    const { user } = await afficher();
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher dans le journal' }), 'administration');
    expect(actionsAffichees()).toEqual(['Module désactivé']);
  });

  it('« Effacer les filtres » remet catégorie, auteur et recherche, mais garde la période', async () => {
    const { user } = await afficher();
    await user.click(bouton('7 jours'));
    await user.click(bouton('Finances 1'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Auteur' }), 'Awa Sarr');
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher dans le journal' }), 'facture');
    await user.click(bouton('Effacer les filtres'));
    expect(actionsAffichees()).toHaveLength(4);
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans le journal' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Auteur' })).toHaveValue('');
    expect(bouton('Tout 4')).toHaveAttribute('aria-pressed', 'true');
    expect(bouton('7 jours')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Effacer les filtres' })).not.toBeInTheDocument();
  });

  it('aucune trace ne correspond : message dédié, « Effacer les filtres » et export désactivé', async () => {
    const { user } = await afficher();
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher dans le journal' }), 'introuvable');
    expect(screen.getByText('Aucune trace ne correspond à ces filtres.')).toBeInTheDocument();
    expect(bouton(/Exporter/)).toBeDisabled();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les filtres' });
    await user.click(effacer[effacer.length - 1]);
    expect(actionsAffichees()).toHaveLength(4);
  });

  it('lien partagé vers un auteur absent de la période : gardé dans la liste, aucune trace', async () => {
    adresse.params = new URLSearchParams('par=Compte+supprim%C3%A9');
    window.history.replaceState(null, '', '/groupe?par=Compte+supprim%C3%A9');
    await afficher();
    expect(screen.getByRole('combobox', { name: 'Auteur' })).toHaveValue('Compte supprimé');
    expect(screen.getByText('Aucune trace ne correspond à ces filtres.')).toBeInTheDocument();
  });
});

describe('JournalAudit · fil par jour', () => {
  it('regroupe par jour avec « Aujourd’hui », « Hier » puis la date, en heure de Dakar', async () => {
    await afficher();
    const titres = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titres).toEqual(['Aujourd’hui · dimanche 8 novembre', 'Hier · samedi 7 novembre', 'Jeudi 5 novembre']);
    // La trace de 23h30 UTC reste le samedi (le fuseau de l'appareil est UTC+14).
    const hier = screen.getByRole('heading', { name: 'Hier · samedi 7 novembre' }).closest('li')!;
    expect(within(hier).getByText('Module désactivé')).toBeInTheDocument();
    expect(within(hier).getByText('Réglage modifié')).toBeInTheDocument();
    expect(within(hier).getByText('23:30')).toBeInTheDocument();
  });

  it('affiche « le HUB » comme auteur d’une trace sans auteur', async () => {
    await afficher();
    const jeudi = screen.getByRole('heading', { name: 'Jeudi 5 novembre' }).closest('li')!;
    expect(within(jeudi).getByText('le HUB')).toBeInTheDocument();
  });

  it('le motif d’une intervention est affiché à part du détail', async () => {
    await afficher();
    expect(screen.getByText('crm · CRM désactivé')).toBeInTheDocument();
    const motif = screen.getByText('Motif').closest('p')!;
    expect(motif).toHaveTextContent('Motif audit interne');
    expect(screen.queryByText(/motif : audit/)).not.toBeInTheDocument();
  });

  it('un détail long est replié avec « Voir plus », qui le déplie et devient « Voir moins »', async () => {
    const long = `Droits modifiés : ${'Finances › Lecture, Écriture, Validation · '.repeat(5)}fin`;
    const { user } = await afficher({ ...RICHE, lignes: [{ ...REGLAGE, detail: long }, VERROU] });
    const plus = bouton('Voir plus');
    expect(plus).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(long)).toHaveClass('is-replie');
    await user.click(plus);
    expect(bouton('Voir moins')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(long)).not.toHaveClass('is-replie');
    // Un détail court n'a pas de bouton.
    expect(screen.getAllByRole('button', { name: /Voir (plus|moins)/ })).toHaveLength(1);
  });

  it('affiche les traces par tranches de 100 avec « Afficher plus »', async () => {
    const lignes: LigneAudit[] = Array.from({ length: 250 }, (_, i) => ({
      ...REGLAGE,
      id: `T${i}`,
      action: `Action ${i}`,
      le: new Date(Date.UTC(2026, 10, 8, 9, 0, 0) - i * 60_000).toISOString(),
    }));
    const { user } = await afficher({ ...RICHE, lignes });
    const tracesAffichees = () => screen.getAllByText(/^Action \d+$/).length;
    expect(tracesAffichees()).toBe(100);
    await user.click(bouton('Afficher plus (150 restantes)'));
    expect(tracesAffichees()).toBe(200);
    // Le focus passe à la première trace ajoutée, pas en haut de la page.
    expect(screen.getByText('Action 100').closest('li')).toHaveFocus();
    await user.click(bouton('Afficher plus (50 restantes)'));
    expect(tracesAffichees()).toBe(250);
    expect(screen.getByText('Action 200').closest('li')).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Afficher plus/ })).not.toBeInTheDocument();
  });

  it('changer un filtre revient à la première tranche de 100', async () => {
    const lignes: LigneAudit[] = Array.from({ length: 250 }, (_, i) => ({
      ...REGLAGE,
      id: `T${i}`,
      action: `Action ${i}`,
      le: new Date(Date.UTC(2026, 10, 8, 9, 0, 0) - i * 60_000).toISOString(),
    }));
    const { user } = await afficher({ ...RICHE, lignes });
    await user.click(bouton('Afficher plus (150 restantes)'));
    await user.click(bouton('Réglages 250'));
    expect(screen.getAllByText(/^Action \d+$/)).toHaveLength(100);
  });

  it('journal vide : « Aucune trace sur cette période. » et export désactivé', async () => {
    await afficher({ ...RICHE, lignes: [] });
    expect(screen.getByText('Aucune trace sur cette période.')).toBeInTheDocument();
    expect(bouton(/Exporter/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Effacer les filtres' })).not.toBeInTheDocument();
  });

  it('l’export reprend seulement les traces filtrées, nommé d’après la période', async () => {
    const { user } = await afficher();
    await user.click(bouton('Finances 1'));
    await user.click(bouton(/Exporter/));
    expect(exporterMock).toHaveBeenCalledTimes(1);
    const [nom, , lignes] = exporterMock.mock.calls[0];
    expect(nom).toBe('journal-audit-2026-10-10-2026-11-08');
    expect(lignes).toEqual([FACTURE]);
  });
});

describe('JournalAudit · critères dans l’adresse', () => {
  it('écrit les critères dans l’adresse en gardant l’onglet, sans la recherche', async () => {
    adresse.params = new URLSearchParams('onglet=journal');
    window.history.replaceState(null, '', '/groupe?onglet=journal');
    const { user } = await afficher();
    await user.click(bouton('7 jours'));
    await user.click(bouton('Finances 1'));
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher dans le journal' }), 'F2026');
    expect(window.location.pathname).toBe('/groupe');
    expect(Object.fromEntries(adresseActuelle())).toEqual({
      onglet: 'journal',
      periode: '7j',
      categorie: 'finances',
    });
  });

  it('revenir aux valeurs par défaut les retire de l’adresse', async () => {
    adresse.params = new URLSearchParams('onglet=journal');
    window.history.replaceState(null, '', '/groupe?onglet=journal');
    const { user } = await afficher();
    await user.click(bouton('Finances 1'));
    await user.click(bouton('Tout 4'));
    expect(window.location.search).toBe('?onglet=journal');
  });

  it('n’ajoute pas d’entrée d’historique en filtrant', async () => {
    const { user } = await afficher();
    const avant = window.history.length;
    await user.click(bouton('Finances 1'));
    await user.click(bouton('7 jours'));
    expect(window.history.length).toBe(avant);
  });

  it('lit les critères de l’adresse au premier affichage', async () => {
    adresse.params = new URLSearchParams('periode=7j&categorie=finances');
    window.history.replaceState(null, '', '/groupe?periode=7j&categorie=finances');
    await afficher();
    expect(charger).toHaveBeenCalledWith('grey-concrete', '2026-11-02', '2026-11-08');
    expect(bouton('Finances 1')).toHaveAttribute('aria-pressed', 'true');
    expect(actionsAffichees()).toEqual(['Facture émise']);
  });

  it('relit les critères quand l’adresse change (Précédent, lien)', async () => {
    const { rerender } = await afficher();
    adresse.params = new URLSearchParams('periode=7j&categorie=comptes');
    window.history.replaceState(null, '', '/groupe?periode=7j&categorie=comptes');
    rerender(<JournalAudit slug="grey-concrete" />);
    expect(await screen.findByRole('button', { name: 'Comptes 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(actionsAffichees()).toEqual(['Compte verrouillé']);
    expect(bouton('7 jours')).toHaveAttribute('aria-pressed', 'true');
    expect(charger).toHaveBeenLastCalledWith('grey-concrete', '2026-11-02', '2026-11-08');
  });

  it('ne relit pas l’adresse qu’il vient lui-même d’écrire (la saisie n’est pas écrasée)', async () => {
    const { user, rerender } = await afficher();
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher dans le journal' }), 'awa');
    // Next renvoie l'adresse que le composant vient d'écrire.
    adresse.params = new URLSearchParams(window.location.search);
    rerender(<JournalAudit slug="grey-concrete" />);
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans le journal' })).toHaveValue('awa');
    expect(actionsAffichees()).toEqual(['Facture émise', 'Réglage modifié']);
  });
});
