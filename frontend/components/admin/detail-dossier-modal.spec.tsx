import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { niveauSuffisant } from '@/lib/auth';
import { getHistorique } from '@/lib/crm';
import type { Localite, Personne, Projet, TransitionDossier } from '@/lib/types';
import { formatDate } from '@hub/domain';
import { DetailDossierModal } from './detail-dossier-modal';

// Machine chargée, rendu lourd (tiroir complet) : délais larges.
vi.setConfig({ testTimeout: 30_000 });

// --- Doublures ---------------------------------------------------------------
// Réseau (historique, décisions) et sections enfants lourdes remplacés par
// des doublures simples ; la complétude de la fiche, la recherche de localité,
// le menu « ⋯ », la confirmation et le tiroir restent les vrais.

// Bouton principal rendu par la doublure d'« Offre & contrat » : c'est lui que
// le pied reprend. `null` = aucune action principale.
const doublure = vi.hoisted(() => ({
  principal: null as string | null,
  principalDesactive: false,
}));

vi.mock('@/lib/crm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/crm')>()),
  getHistorique: vi.fn(),
}));
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  niveauSuffisant: vi.fn(() => false),
}));
vi.mock('@/lib/layout-contexte', () => ({ useSessionCourante: vi.fn(() => ({})) }));
vi.mock('@/components/pilotage/decisions-fiche', () => ({ DecisionsFiche: () => null }));
vi.mock('./cycle-dossier', () => ({ CycleDossier: () => <p>Cycle du dossier</p> }));
vi.mock('./offre-dossier', () => ({
  OffreDossier: () =>
    doublure.principal ? (
      <button type="button" className="btn-primary" data-action-principale="" disabled={doublure.principalDesactive}>
        {doublure.principal}
      </button>
    ) : null,
}));
vi.mock('./contrat-dossier', () => ({ ContratDossier: () => null }));
vi.mock('@/features/projects/project-teams', () => ({
  ProjectTeams: ({ canEdit }: { canEdit: boolean }) => <p>Équipes {canEdit ? 'modifiables' : 'en lecture'}</p>,
}));
vi.mock('./fiche-apporteur-section', () => ({ FicheApporteurSection: () => <p>Fiche apporteur</p> }));
// Fiche éditable : un champ manquant que « Compléter » doit rendre actif.
vi.mock('./caracteristiques-projet', () => ({
  CaracteristiquesProjet: () => (
    <div>
      <input aria-label="Catégorie (rempli)" className="is-rempli" />
      <input aria-label="Surface du terrain" className="is-manquant" />
    </div>
  ),
}));

const historiqueMock = vi.mocked(getHistorique);
const niveauMock = vi.mocked(niveauSuffisant);

// jsdom : ni scrollIntoView ni matchMedia.
Element.prototype.scrollIntoView = vi.fn();
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

// --- Données -------------------------------------------------------------------

const SLUG = 'grey-concrete';
const HEURE = 3_600_000;
// 09/11/2026 à midi (UTC = heure de Dakar). Fuseau de l'appareil : UTC+14.
const MAINTENANT = new Date('2026-11-09T12:00:00Z');
const ilYa = (heures: number) => new Date(MAINTENANT.getTime() - heures * HEURE).toISOString();

const DIR_GC: Personne = { id: 'u-dirgc', nom: 'Awa Ndiaye' };
const AUTRE_DIR_GC: Personne = { id: 'u-dirgc-2', nom: 'Ibrahima Sall' };
const COO: Personne = { id: 'u-coo', nom: 'Fatou Sarr' };

const LOCALITES = [
  { id: 'loc-alm', nom: 'Almadies', code: 'ALM', zone: 'dakar', region: 'Dakar' },
  { id: 'loc-ngo', nom: 'Ngor', code: 'NGO', zone: 'dakar', region: 'Dakar' },
].map((l) => ({ arrondissement: null, commune: null, codeVerrouille: false, ...l })) as Localite[];

// Fiche complète (9/9), en « Nouveau projet », créée il y a 10 h.
const projetComplet = (champs: Partial<Projet> = {}): Projet => ({
  id: 'p-1',
  code: 'DFS_ALM.26',
  nature: 'mandat_client',
  categorie: 'conception',
  localisation: 'Almadies',
  localite: { id: 'loc-alm', code: 'ALM', nom: 'Almadies' },
  type: 'villa',
  nbPlanches: 2,
  surfaceTerrain: 450,
  client: { id: 'cli-1', nom: 'Daouda Faye Sow', type: 'particulier' },
  standing: 'moyen',
  gamme: 'local',
  programme: 'Villa R+1, 4 chambres',
  ficheProgramme: null,
  statut: 'nouveau_projet',
  projetId: null,
  verrouillee: false,
  creeLe: ilYa(10),
  creePar: COO,
  proprietaire: DIR_GC,
  categorieConception: null,
  offreExpiree: false,
  soumisLe: null,
  renvoi: null,
  archive: null,
  ...champs,
});

// Trois champs manquants : surface, standing, programme (6/9).
const projetIncomplet = (champs: Partial<Projet> = {}): Projet =>
  projetComplet({ surfaceTerrain: 0, standing: null, programme: '', ...champs });

const ARCHIVE = { le: '2026-11-05T09:00:00Z', par: DIR_GC };

const transition = (
  id: string,
  de: TransitionDossier['de'],
  vers: TransitionDossier['vers'],
  le: string,
  extra: Partial<TransitionDossier> = {},
): TransitionDossier => ({
  id,
  de,
  vers,
  le,
  par: null,
  commentaire: null,
  ...extra,
});

type Props = Parameters<typeof DetailDossierModal>[0];

function rendre(projet: Projet, props: Partial<Props> = {}) {
  const user = userEvent.setup();
  const rappels = {
    onMaj: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    onAgir: vi.fn().mockResolvedValue(null),
    onRattacher: vi.fn().mockResolvedValue(undefined),
    onChangerProprietaire: vi.fn().mockResolvedValue(undefined),
    onArchiver: vi.fn().mockResolvedValue(undefined),
    onDesarchiver: vi.fn().mockResolvedValue(undefined),
    onModifierFiche: vi.fn().mockResolvedValue(undefined),
  };
  const utils = render(
    <DetailDossierModal
      slug={SLUG}
      projet={projet}
      localites={LOCALITES}
      proprietaires={[DIR_GC, AUTRE_DIR_GC]}
      peutEcrire
      peutReassigner
      peutArchiver
      peutPreparerOffre
      peutFacturer={false}
      {...rappels}
      {...props}
    />,
  );
  return { ...utils, ...rappels, user };
}

// --- Helpers de lecture ----------------------------------------------------

const onglets = () => within(screen.getByRole('navigation', { name: 'Sections de la fiche' }));
const nomsOnglets = () =>
  onglets()
    .getAllByRole('link')
    .map((a) => a.firstChild?.textContent);
const etapes = () => within(screen.getByRole('list', { name: 'Étapes du dossier' })).getAllByRole('listitem');
const pied = () => document.querySelector<HTMLElement>('.fiche-dossier-pied');
const situation = () => within(screen.getByRole('region', { name: 'Situation' }));
const evenements = () =>
  [...document.querySelectorAll('.fiche-dossier-fil li')].map((li) => ({
    texte: li.querySelector('.fiche-dossier-evenement')?.textContent,
    quand: li.querySelector('time')?.textContent,
  }));
const historiqueCharge = () => waitFor(() => expect(historiqueMock).toHaveBeenCalled());

function differe<T>() {
  let resoudre!: (v: T) => void;
  let rejeter!: (e: unknown) => void;
  const promesse = new Promise<T>((res, rej) => {
    resoudre = res;
    rejeter = rej;
  });
  return { promesse, resoudre, rejeter };
}

async function ouvrirMenu(user: ReturnType<typeof userEvent.setup>, code = 'DFS_ALM.26') {
  await user.click(screen.getByRole('button', { name: `Plus d’actions pour ${code}` }));
}

// --- Tests -------------------------------------------------------------------

describe('DetailDossierModal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MAINTENANT);
    historiqueMock.mockResolvedValue([]);
    niveauMock.mockReturnValue(false);
    doublure.principal = null;
    doublure.principalDesactive = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('en-tête', () => {
    it('affiche le code, le statut, le client, sa nature, la localité et la date de création', async () => {
      rendre(projetComplet({ creeLe: '2026-11-02T08:15:00Z' }));
      await historiqueCharge();
      expect(screen.getByRole('heading', { level: 2, name: 'DFS_ALM.26' })).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'DFS_ALM.26' })).toBeInTheDocument();
      const tete = screen.getByRole('heading', { level: 2 }).closest('header') as HTMLElement;
      expect(within(tete).getByText('Nouveau projet')).toBeInTheDocument();
      const meta = within(tete).getByText('Daouda Faye Sow').closest('p');
      expect(meta).toHaveTextContent('Daouda Faye Sow · Personne physique · Almadies · créé le 02/11/2026');
    });

    it('présente une société cliente comme personne morale', async () => {
      rendre(projetComplet({ client: { id: 'cli-2', nom: 'Teranga Capital', type: 'entreprise', sigle: 'TC' } }));
      await historiqueCharge();
      expect(screen.getByText('Teranga Capital').closest('p')).toHaveTextContent('Personne morale');
    });

    it('reprend le libellé saisi quand la localité n’est pas rattachée au référentiel', async () => {
      rendre(projetComplet({ localite: null, localisation: 'Pointe des Almadies' }));
      await historiqueCharge();
      expect(screen.getByText('Daouda Faye Sow').closest('p')).toHaveTextContent('Pointe des Almadies');
    });

    it('remplace le statut par « Archivé » pour un lead archivé', async () => {
      rendre(projetIncomplet({ archive: ARCHIVE }));
      await historiqueCharge();
      const tete = screen.getByRole('heading', { level: 2 }).closest('header') as HTMLElement;
      expect(within(tete).getByText('Archivé')).toBeInTheDocument();
      expect(within(tete).queryByText('Nouveau projet')).not.toBeInTheDocument();
    });

    it('ferme la fiche avec le bouton « Fermer »', async () => {
      const { user, onClose } = rendre(projetComplet());
      await user.click(screen.getByRole('button', { name: 'Fermer' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('jauge de complétude', () => {
    it('affiche « Fiche 6/9 » et le nombre de champs à compléter', async () => {
      rendre(projetIncomplet());
      await historiqueCharge();
      expect(screen.getByText(/Fiche 6\/9/)).toBeInTheDocument();
      expect(screen.getByText('3 champs à compléter')).toBeInTheDocument();
    });

    it('accorde « champ » au singulier quand il n’en manque qu’un', async () => {
      rendre(projetComplet({ gamme: null }));
      await historiqueCharge();
      expect(screen.getByText('1 champ à compléter')).toBeInTheDocument();
    });

    it('expose la complétude en barre de progression accessible', async () => {
      rendre(projetIncomplet());
      await historiqueCharge();
      const barre = screen.getByRole('progressbar', { name: 'Complétude de la fiche' });
      expect(barre).toHaveAttribute('aria-valuenow', '6');
      expect(barre).toHaveAttribute('aria-valuemin', '0');
      expect(barre).toHaveAttribute('aria-valuemax', '9');
    });

    it('masque la jauge une fois la fiche complète (la Situation le dit)', async () => {
      rendre(projetComplet());
      await historiqueCharge();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.queryByText(/à compléter$/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Compléter' })).not.toBeInTheDocument();
      expect(screen.getByText('Fiche complète · prête pour l’offre')).toBeInTheDocument();
    });

    it('propose « Compléter » quand la fiche est incomplète et modifiable', async () => {
      rendre(projetIncomplet());
      await historiqueCharge();
      expect(screen.getByRole('button', { name: 'Compléter' })).toBeInTheDocument();
    });

    it('ne propose pas « Compléter » sans droit d’écriture', async () => {
      rendre(projetIncomplet(), { peutEcrire: false });
      await historiqueCharge();
      expect(screen.getByText('3 champs à compléter')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Compléter' })).not.toBeInTheDocument();
    });

    it('« Compléter » rend actif le premier champ manquant de la fiche', async () => {
      const { user } = rendre(projetIncomplet());
      await historiqueCharge();
      await user.click(screen.getByRole('button', { name: 'Compléter' }));
      expect(screen.getByRole('textbox', { name: 'Surface du terrain' })).toHaveFocus();
      expect(onglets().getByRole('link', { name: /^Fiche/ })).toHaveAttribute('aria-current', 'true');
    });

    it('n’affiche pas de jauge après la soumission au CFO', async () => {
      rendre(projetComplet({ statut: 'en_validation', verrouillee: true }));
      await historiqueCharge();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('n’affiche pas de jauge pour un lead archivé', async () => {
      rendre(projetIncomplet({ archive: ARCHIVE }));
      await historiqueCharge();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.queryByText(/champs à compléter/)).not.toBeInTheDocument();
    });

    it('affiche la jauge d’une fiche incomplète même sans droit de lecture du propriétaire', async () => {
      const { proprietaire: _p, ...sansProprietaire } = projetIncomplet();
      rendre(sansProprietaire as Projet);
      await historiqueCharge();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(document.querySelector('.fiche-dossier-proprio')).toBeNull();
    });
  });

  describe('propriétaire', () => {
    it('affiche le nom du propriétaire dans le bandeau', async () => {
      rendre(projetComplet());
      await historiqueCharge();
      const bandeau = document.querySelector('.fiche-dossier-bandeau') as HTMLElement;
      expect(within(bandeau).getByText('Propriétaire')).toBeInTheDocument();
      expect(within(bandeau).getByText('Awa Ndiaye')).toBeInTheDocument();
    });

    it('affiche « À assigner » quand le dossier n’a pas de propriétaire', async () => {
      rendre(projetComplet({ proprietaire: null }));
      await historiqueCharge();
      const bandeau = document.querySelector('.fiche-dossier-bandeau') as HTMLElement;
      expect(within(bandeau).getByText('À assigner')).toBeInTheDocument();
    });

    it('n’affiche aucun propriétaire sans droit de lecture (clé absente)', async () => {
      const { proprietaire: _p, ...sansProprietaire } = projetIncomplet();
      rendre(sansProprietaire as Projet);
      await historiqueCharge();
      expect(screen.queryByText('Propriétaire')).not.toBeInTheDocument();
      expect(screen.queryByText('Awa Ndiaye')).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: 'Propriétaire de la fiche' })).not.toBeInTheDocument();
      // La jauge reste : la fiche est incomplète.
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('menu « ⋯ »', () => {
    it('Échap referme le menu sans fermer la fiche', async () => {
      const { user, onClose } = rendre(projetComplet());
      await ouvrirMenu(user);
      expect(screen.getByRole('button', { name: 'Copier le code' })).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('button', { name: 'Copier le code' })).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Plus d’actions pour DFS_ALM.26' })).toHaveFocus();
    });

    it('copie le code du dossier dans le presse-papiers et le confirme', async () => {
      const { user } = rendre(projetComplet());
      const ecrire = vi.spyOn(navigator.clipboard, 'writeText');
      await ouvrirMenu(user);
      await user.click(screen.getByRole('button', { name: 'Copier le code' }));
      expect(ecrire).toHaveBeenCalledWith('DFS_ALM.26');
      await ouvrirMenu(user);
      expect(await screen.findByRole('button', { name: 'Code copié' })).toBeInTheDocument();
    });

    it('garde « Copier le code » si le presse-papiers est refusé', async () => {
      const { user } = rendre(projetComplet());
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('refusé'));
      await ouvrirMenu(user);
      await user.click(screen.getByRole('button', { name: 'Copier le code' }));
      await ouvrirMenu(user);
      expect(screen.getByRole('button', { name: 'Copier le code' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Code copié' })).not.toBeInTheDocument();
    });

    it('propose l’archivage d’un nouveau projet à qui peut archiver', async () => {
      const { user } = rendre(projetIncomplet());
      await ouvrirMenu(user);
      expect(screen.getByRole('button', { name: 'Archiver ce lead…' })).toBeInTheDocument();
    });

    it('ne propose pas l’archivage sans le droit d’archiver', async () => {
      const { user } = rendre(projetIncomplet(), { peutArchiver: false });
      await ouvrirMenu(user);
      expect(screen.getByRole('button', { name: 'Copier le code' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /archiver/i })).not.toBeInTheDocument();
    });

    it.each(['en_validation', 'offre_envoyee', 'onboard', 'perdu'] as const)(
      'ne propose pas l’archivage d’un dossier en statut « %s »',
      async (statut) => {
        const { user } = rendre(projetComplet({ statut }));
        await ouvrirMenu(user);
        expect(screen.queryByRole('button', { name: /archiver/i })).not.toBeInTheDocument();
      },
    );

    it('demande confirmation puis archive le lead et ferme la confirmation', async () => {
      const { user, onArchiver, onDesarchiver } = rendre(projetIncomplet());
      await ouvrirMenu(user);
      await user.click(screen.getByRole('button', { name: 'Archiver ce lead…' }));
      const confirmation = screen.getByRole('alertdialog', { name: 'Archiver DFS_ALM.26 ?' });
      expect(onArchiver).not.toHaveBeenCalled();
      await user.click(within(confirmation).getByRole('button', { name: 'Archiver' }));
      expect(onArchiver).toHaveBeenCalledTimes(1);
      expect(onDesarchiver).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    });

    it('n’archive rien quand on annule la confirmation', async () => {
      const { user, onArchiver } = rendre(projetIncomplet());
      await ouvrirMenu(user);
      await user.click(screen.getByRole('button', { name: 'Archiver ce lead…' }));
      await user.click(screen.getByRole('button', { name: 'Annuler' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(onArchiver).not.toHaveBeenCalled();
    });

    it('affiche l’erreur de l’archivage et garde la confirmation ouverte', async () => {
      const { user, onArchiver, onClose } = rendre(projetIncomplet());
      onArchiver.mockRejectedValue(new Error('Ce lead a déjà une offre.'));
      await ouvrirMenu(user);
      await user.click(screen.getByRole('button', { name: 'Archiver ce lead…' }));
      await user.click(screen.getByRole('button', { name: 'Archiver' }));
      expect(await screen.findByText('Ce lead a déjà une offre.')).toBeInTheDocument();
      expect(screen.getByRole('alertdialog', { name: 'Archiver DFS_ALM.26 ?' })).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('désarchive un lead archivé après confirmation', async () => {
      const { user, onArchiver, onDesarchiver } = rendre(projetIncomplet({ archive: ARCHIVE }));
      await ouvrirMenu(user);
      await user.click(screen.getByRole('button', { name: 'Désarchiver ce lead…' }));
      const confirmation = screen.getByRole('alertdialog', { name: 'Désarchiver DFS_ALM.26 ?' });
      await user.click(within(confirmation).getByRole('button', { name: 'Désarchiver' }));
      expect(onDesarchiver).toHaveBeenCalledTimes(1);
      expect(onArchiver).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    });
  });

  describe('onglets', () => {
    it('liste Fiche, Apporteur, Offre & contrat et Historique quand l’apporteur est lisible', async () => {
      rendre(projetComplet({ apporteur: null }));
      await historiqueCharge();
      expect(nomsOnglets()).toEqual(['Fiche', 'Apporteur', 'Offre & contrat', 'Historique']);
    });

    it('omet l’onglet Apporteur sans droit de lecture de la fiche apporteur (clé absente)', async () => {
      rendre(projetComplet());
      await historiqueCharge();
      expect(nomsOnglets()).toEqual(['Fiche', 'Offre & contrat', 'Historique']);
      expect(screen.queryByText('Fiche apporteur')).not.toBeInTheDocument();
    });

    it('omet l’onglet et la section « Offre & contrat » pour un lead archivé', async () => {
      rendre(projetIncomplet({ archive: ARCHIVE, apporteur: null }));
      await historiqueCharge();
      expect(nomsOnglets()).toEqual(['Fiche', 'Apporteur', 'Historique']);
      expect(screen.queryByRole('region', { name: 'Offre & contrat' })).not.toBeInTheDocument();
      expect(screen.queryByText('Cycle du dossier')).not.toBeInTheDocument();
    });

    it('affiche le nombre de champs manquants sur l’onglet Fiche d’un nouveau projet', async () => {
      rendre(projetIncomplet());
      await historiqueCharge();
      const fiche = onglets().getByRole('link', { name: /^Fiche/ });
      expect(fiche.querySelector('.fiche-dossier-onglet-nombre')).toHaveTextContent('3');
      expect(
        onglets().getByRole('link', { name: 'Historique' }).querySelector('.fiche-dossier-onglet-nombre'),
      ).toBeNull();
    });

    it('n’affiche pas de nombre sur l’onglet Fiche une fois la fiche complète', async () => {
      rendre(projetComplet());
      await historiqueCharge();
      expect(onglets().getByRole('link', { name: 'Fiche' })).toBeInTheDocument();
    });

    it('n’affiche pas de nombre sur l’onglet Fiche d’un lead archivé', async () => {
      rendre(projetIncomplet({ archive: ARCHIVE }));
      await historiqueCharge();
      expect(onglets().getByRole('link', { name: 'Fiche' })).toBeInTheDocument();
    });

    it('marque l’onglet Fiche comme actif à l’ouverture', async () => {
      rendre(projetComplet());
      await historiqueCharge();
      expect(onglets().getByRole('link', { name: 'Fiche' })).toHaveAttribute('aria-current', 'true');
    });

    it('rend actif l’onglet cliqué et fait défiler jusqu’à sa section', async () => {
      const { user } = rendre(projetComplet());
      await historiqueCharge();
      const scroll = vi.mocked(Element.prototype.scrollIntoView);
      scroll.mockClear();
      await user.click(onglets().getByRole('link', { name: 'Historique' }));
      expect(onglets().getByRole('link', { name: 'Historique' })).toHaveAttribute('aria-current', 'true');
      expect(onglets().getByRole('link', { name: 'Fiche' })).not.toHaveAttribute('aria-current');
      const section = document.getElementById('fiche-dossier-historique');
      expect(scroll.mock.contexts).toContain(section);
    });
  });

  describe('frise des étapes', () => {
    it('désigne l’étape courante et marque les étapes passées comme faites', async () => {
      rendre(projetComplet({ statut: 'offre_envoyee', verrouillee: true }));
      await historiqueCharge();
      const [nouveau, validation, offre, onboard] = etapes();
      expect(offre).toHaveAttribute('aria-current', 'step');
      expect(screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'step')).toHaveLength(
        1,
      );
      expect(nouveau).toHaveClass('is-fait');
      expect(validation).toHaveClass('is-fait');
      expect(onboard).not.toHaveClass('is-fait');
      expect(onboard).toHaveTextContent('à venir');
      expect(situation().getByText('Étape 3 sur 4 · Offre envoyée')).toBeInTheDocument();
    });

    it('date les étapes d’après l’historique (dernier passage)', async () => {
      historiqueMock.mockResolvedValue([
        transition('t1', null, 'nouveau_projet', '2026-11-01T09:00:00Z'),
        transition('t2', 'nouveau_projet', 'en_validation', '2026-11-03T10:00:00Z'),
        transition('t3', 'en_validation', 'nouveau_projet', '2026-11-04T10:00:00Z', { commentaire: 'Surface erronée' }),
        transition('t4', 'nouveau_projet', 'en_validation', '2026-11-06T10:00:00Z'),
        // Événement de la fiche (de = vers) : ne date aucune étape.
        transition('t5', 'en_validation', 'en_validation', '2026-11-07T10:00:00Z', {
          commentaire: 'Apporteur modifié',
        }),
        transition('t6', 'en_validation', 'offre_envoyee', '2026-11-08T10:00:00Z'),
      ]);
      rendre(projetComplet({ statut: 'offre_envoyee', verrouillee: true }));
      await waitFor(() => expect(etapes()[2]).toHaveTextContent('le 08/11/2026'));
      const [nouveau, validation] = etapes();
      expect(nouveau).toHaveTextContent('le 04/11/2026');
      expect(validation).toHaveTextContent('le 06/11/2026');
    });

    it('date l’étape 1 du retour (« revenu le ») après un renvoi du CFO', async () => {
      historiqueMock.mockResolvedValue([
        transition('t1', null, 'nouveau_projet', '2026-11-01T09:00:00Z'),
        transition('t2', 'nouveau_projet', 'en_validation', '2026-11-03T09:00:00Z'),
        transition('t3', 'en_validation', 'nouveau_projet', '2026-11-05T09:00:00Z'),
      ]);
      rendre(projetComplet());
      await waitFor(() => expect(etapes()[0]).toHaveTextContent('revenu le 05/11/2026'));
    });

    it('date l’étape 1 de la création tant qu’aucun renvoi ne l’a rouverte', async () => {
      const projet = projetComplet();
      rendre(projet);
      await historiqueCharge();
      expect(etapes()[0]).toHaveAttribute('aria-current', 'step');
      expect(etapes()[0]).toHaveTextContent(`le ${formatDate(projet.creeLe)}`);
      expect(etapes()[0]).not.toHaveTextContent('revenu');
      expect(situation().getByText('Étape 1 sur 4 · Nouveau projet')).toBeInTheDocument();
    });

    it('n’a aucune étape courante pour un dossier perdu', async () => {
      rendre(projetComplet({ statut: 'perdu' }));
      await historiqueCharge();
      expect(etapes().some((li) => li.hasAttribute('aria-current'))).toBe(false);
      expect(etapes().every((li) => !li.classList.contains('is-fait'))).toBe(true);
      expect(situation().getByText('Dossier perdu : le cycle est clos')).toBeInTheDocument();
    });

    it('n’a aucune étape courante pour un lead archivé et le signale', async () => {
      rendre(projetIncomplet({ archive: ARCHIVE }));
      await historiqueCharge();
      expect(etapes().some((li) => li.hasAttribute('aria-current'))).toBe(false);
      expect(situation().getByText('Lead archivé : consultable seulement')).toBeInTheDocument();
      expect(
        situation().getByText(/Lead archivé le 05\/11\/2026 par Awa Ndiaye : consultable seulement/),
      ).toBeInTheDocument();
    });
  });

  describe('pastille de délai', () => {
    const pastille = (texte: string) => situation().getByText(texte);

    it('affiche le temps restant sur les 72 h pour compléter la fiche', async () => {
      rendre(projetIncomplet({ creeLe: ilYa(10) }));
      await historiqueCharge();
      expect(pastille('Fiche à compléter · reste 2 j 14 h')).toHaveClass('pill--attention');
    });

    it('affiche les heures seules quand il reste moins d’un jour, arrondies au-dessus comme le serveur', async () => {
      rendre(projetIncomplet({ creeLe: ilYa(71.5) }));
      await historiqueCharge();
      expect(pastille('Fiche à compléter · reste 1 h')).toBeInTheDocument();
    });

    it('signale le dépassement des 72 h', async () => {
      rendre(projetIncomplet({ creeLe: ilYa(73) }));
      await historiqueCharge();
      expect(pastille('Délai de 72 h dépassé : relance en cours')).toHaveClass('pill--risque');
    });

    it('annonce une fiche complète prête pour l’offre, même au-delà des 72 h', async () => {
      rendre(projetComplet({ creeLe: ilYa(200) }));
      await historiqueCharge();
      expect(pastille('Fiche complète · prête pour l’offre')).toHaveClass('pill--succes');
    });

    it('compte les 48 h de validation CFO depuis la soumission', async () => {
      historiqueMock.mockResolvedValue([
        transition('t1', null, 'nouveau_projet', ilYa(60)),
        transition('t2', 'nouveau_projet', 'en_validation', ilYa(10)),
      ]);
      rendre(projetComplet({ statut: 'en_validation', verrouillee: true }));
      expect(await situation().findByText('Validation CFO · reste 1 j 14 h')).toBeInTheDocument();
    });

    it('signale le dépassement des 48 h de validation CFO', async () => {
      historiqueMock.mockResolvedValue([transition('t2', 'nouveau_projet', 'en_validation', ilYa(50))]);
      rendre(projetComplet({ statut: 'en_validation', verrouillee: true }));
      expect(await situation().findByText('Validation CFO : délai de 48 h dépassé')).toHaveClass('pill--risque');
    });

    it('rappelle le délai de 48 h quand la soumission n’est pas datée', async () => {
      rendre(projetComplet({ statut: 'en_validation', verrouillee: true }));
      await historiqueCharge();
      expect(pastille('Validation CFO sous 48 h')).toBeInTheDocument();
    });

    it('signale une offre expirée sans réponse', async () => {
      rendre(projetComplet({ statut: 'offre_envoyee', offreExpiree: true, verrouillee: true }));
      await historiqueCharge();
      expect(pastille('Offre expirée sans réponse')).toHaveClass('pill--risque');
      // Dit une seule fois (pastille), et le pied propose la suite.
      expect(situation().queryByText('Offre expirée sans réponse du client.')).not.toBeInTheDocument();
      expect(
        screen.getByText('Offre expirée sans réponse : refaire une offre ou déclarer le dossier perdu'),
      ).toBeInTheDocument();
    });

    it('attend la réponse du client à une offre envoyée', async () => {
      rendre(projetComplet({ statut: 'offre_envoyee', verrouillee: true }));
      await historiqueCharge();
      expect(pastille('En attente de la réponse du client')).toBeInTheDocument();
    });

    it('annonce le client acquis à l’onboard', async () => {
      rendre(projetComplet({ statut: 'onboard', verrouillee: true }));
      await historiqueCharge();
      expect(pastille('Client acquis · projet ouvert')).toHaveClass('pill--succes');
    });

    it('annonce un dossier perdu', async () => {
      rendre(projetComplet({ statut: 'perdu' }));
      await historiqueCharge();
      expect(pastille('Dossier perdu · cycle clos')).toHaveClass('pill--risque');
    });

    it('annonce un lead archivé, sans délai de 72 h', async () => {
      rendre(projetIncomplet({ archive: ARCHIVE, creeLe: ilYa(200) }));
      await historiqueCharge();
      expect(pastille('Lead archivé')).toHaveClass('pill--neutre');
      expect(situation().queryByText(/72 h/)).not.toBeInTheDocument();
    });
  });

  describe('historique', () => {
    it('liste les événements du plus récent au plus ancien, datés à l’heure de Dakar', async () => {
      historiqueMock.mockResolvedValue([
        transition('t1', null, 'nouveau_projet', '2026-11-01T09:05:00Z', { par: COO }),
        transition('t2', 'nouveau_projet', 'en_validation', '2026-11-03T14:30:00Z', { par: DIR_GC }),
        transition('t3', 'en_validation', 'offre_envoyee', '2026-11-04T08:00:00Z'),
      ]);
      rendre(projetComplet({ statut: 'offre_envoyee', verrouillee: true }));
      await waitFor(() => expect(evenements()).toHaveLength(3));
      expect(evenements()).toEqual([
        { texte: 'Offre validée par le CFO, envoyée au client', quand: 'le 04/11/2026 à 08:00' },
        { texte: 'Offre soumise au CFO par Awa Ndiaye', quand: 'le 03/11/2026 à 14:30' },
        { texte: 'Fiche créée par Fatou Sarr', quand: 'le 01/11/2026 à 09:05' },
      ]);
      expect(historiqueMock).toHaveBeenCalledWith(SLUG, 'p-1');
    });

    it('détaille le renvoi du CFO, la perte et la reprise d’un dossier avec leur motif', async () => {
      historiqueMock.mockResolvedValue([
        transition('t1', 'en_validation', 'nouveau_projet', '2026-11-02T10:00:00Z', { commentaire: 'Surface erronée' }),
        transition('t2', 'nouveau_projet', 'perdu', '2026-11-03T10:00:00Z', { commentaire: 'Projet abandonné' }),
        transition('t3', 'perdu', 'nouveau_projet', '2026-11-04T10:00:00Z', { commentaire: 'Client revenu' }),
      ]);
      rendre(projetComplet());
      await waitFor(() => expect(evenements()).toHaveLength(3));
      expect(evenements().map((e) => e.texte)).toEqual([
        'Dossier rouvert : Client revenu',
        'Dossier perdu : Projet abandonné',
        'Renvoyée par le CFO : Surface erronée',
      ]);
    });

    it('affiche « Aucun événement enregistré » quand l’historique est vide', async () => {
      rendre(projetComplet());
      expect(await screen.findByText('Aucun événement enregistré.')).toBeInTheDocument();
    });

    it('traite un historique en échec comme vide', async () => {
      historiqueMock.mockRejectedValue(new Error('réseau coupé'));
      rendre(projetComplet());
      expect(await screen.findByText('Aucun événement enregistré.')).toBeInTheDocument();
    });

    it('met l’archivage en tête du fil pour un lead archivé (dernier événement)', async () => {
      rendre(projetIncomplet({ archive: ARCHIVE }));
      await waitFor(() => expect(evenements()).toHaveLength(1));
      expect(evenements()[0]).toEqual({ texte: 'Lead archivé par Awa Ndiaye', quand: 'le 05/11/2026 à 09:00' });
      expect(screen.queryByText('Aucun événement enregistré.')).not.toBeInTheDocument();
    });

    it('recharge l’historique quand le statut du dossier change', async () => {
      const { rerender, ...rappels } = rendre(projetComplet());
      await historiqueCharge();
      expect(historiqueMock).toHaveBeenCalledTimes(1);
      rerender(
        <DetailDossierModal
          slug={SLUG}
          projet={projetComplet({ statut: 'en_validation' })}
          localites={LOCALITES}
          proprietaires={[DIR_GC]}
          peutEcrire
          peutReassigner
          peutArchiver
          peutPreparerOffre
          peutFacturer={false}
          onMaj={rappels.onMaj}
          onClose={rappels.onClose}
          onAgir={rappels.onAgir}
          onRattacher={rappels.onRattacher}
          onChangerProprietaire={rappels.onChangerProprietaire}
          onArchiver={rappels.onArchiver}
          onDesarchiver={rappels.onDesarchiver}
          onModifierFiche={rappels.onModifierFiche}
        />,
      );
      await waitFor(() => expect(historiqueMock).toHaveBeenCalledTimes(2));
    });
  });

  describe('pied : prochaine étape', () => {
    it('propose de soumettre l’offre au CFO quand elle existe déjà en brouillon', async () => {
      rendre(projetComplet({ offre: { id: 'o1' } as Projet['offre'] }));
      await historiqueCharge();
      expect(screen.getByText('Soumettre l’offre à la validation du CFO')).toBeInTheDocument();
    });

    it.each([
      ['en_validation', 'Validation de l’offre par le CFO'],
      ['offre_envoyee', 'Réponse du client à l’offre'],
      ['onboard', 'Contrat et équipes du projet'],
      ['perdu', 'Cycle clos'],
    ] as const)('annonce la prochaine étape d’un dossier « %s »', async (statut, texte) => {
      rendre(projetComplet({ statut, verrouillee: statut !== 'perdu' }));
      await historiqueCharge();
      expect(within(pied()!).getByText('Prochaine étape')).toBeInTheDocument();
      expect(within(pied()!).getByText(texte)).toBeInTheDocument();
    });

    it('demande de compléter les champs manquants d’un nouveau projet incomplet', async () => {
      rendre(projetIncomplet());
      await historiqueCharge();
      expect(within(pied()!).getByText('Compléter 3 champs de la fiche pour créer l’offre')).toBeInTheDocument();
    });

    it('accorde au singulier quand il ne manque qu’un champ', async () => {
      rendre(projetComplet({ programme: '   ' }));
      await historiqueCharge();
      expect(within(pied()!).getByText('Compléter 1 champ de la fiche pour créer l’offre')).toBeInTheDocument();
    });

    it('invite à créer l’offre une fois la fiche complète', async () => {
      rendre(projetComplet());
      await historiqueCharge();
      expect(within(pied()!).getByText('Créer l’offre, puis la soumettre à la validation du CFO')).toBeInTheDocument();
    });

    it('reprend le libellé de l’action principale d’« Offre & contrat »', async () => {
      doublure.principal = 'Soumettre au CFO';
      rendre(projetComplet());
      await historiqueCharge();
      expect(within(pied()!).getByRole('button', { name: 'Soumettre au CFO' })).toBeInTheDocument();
    });

    it('mène à l’action principale et lui donne le focus au clic', async () => {
      doublure.principal = 'Soumettre au CFO';
      const { user } = rendre(projetComplet());
      await historiqueCharge();
      await user.click(within(pied()!).getByRole('button', { name: 'Soumettre au CFO' }));
      const section = document.getElementById('fiche-dossier-offre') as HTMLElement;
      expect(within(section).getByRole('button', { name: 'Soumettre au CFO' })).toHaveFocus();
      expect(onglets().getByRole('link', { name: 'Offre & contrat' })).toHaveAttribute('aria-current', 'true');
    });

    it('ignore une action principale désactivée et propose « Compléter la fiche » si elle est incomplète', async () => {
      doublure.principal = 'Créer l’offre';
      doublure.principalDesactive = true;
      const { user } = rendre(projetIncomplet());
      await historiqueCharge();
      expect(within(pied()!).queryByRole('button', { name: 'Créer l’offre' })).not.toBeInTheDocument();
      await user.click(within(pied()!).getByRole('button', { name: 'Compléter la fiche' }));
      expect(screen.getByRole('textbox', { name: 'Surface du terrain' })).toHaveFocus();
    });

    it('n’a pas de bouton quand la fiche est incomplète mais non modifiable et sans action', async () => {
      rendre(projetIncomplet(), { peutEcrire: false });
      await historiqueCharge();
      expect(within(pied()!).queryByRole('button')).not.toBeInTheDocument();
    });

    it('n’a pas de bouton quand aucune action principale n’est proposée et la fiche est complète', async () => {
      rendre(projetComplet({ statut: 'offre_envoyee', verrouillee: true }));
      await historiqueCharge();
      expect(within(pied()!).queryByRole('button')).not.toBeInTheDocument();
    });

    it('n’affiche pas de pied pour un lead archivé', async () => {
      rendre(projetIncomplet({ archive: ARCHIVE }));
      await historiqueCharge();
      expect(pied()).toBeNull();
      expect(screen.queryByText('Prochaine étape')).not.toBeInTheDocument();
    });
  });

  describe('fiche en lecture', () => {
    it('liste les champs de la fiche en lecture une fois verrouillée', async () => {
      rendre(projetComplet({ statut: 'en_validation', verrouillee: true }));
      await historiqueCharge();
      expect(screen.getByText('Verrouillé depuis l’émission de l’offre')).toBeInTheDocument();
      expect(screen.getByText('450 m²')).toBeInTheDocument();
      // Le type de projet n'est plus un champ de la fiche (09/11/2026).
      expect(screen.queryByText('Type de projet')).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Surface du terrain' })).not.toBeInTheDocument();
    });

    it('annonce autant de champs dans le titre que la liste en affiche', async () => {
      rendre(projetComplet({ statut: 'en_validation', verrouillee: true }));
      await historiqueCharge();
      const lignes = document.querySelectorAll('.fiche-crm-champs > div');
      expect(lignes).toHaveLength(9);
      expect(screen.getByRole('heading', { name: `Les ${lignes.length} champs de la fiche` })).toBeInTheDocument();
    });
  });

  describe('rattachement de localité', () => {
    const nonRattache = () => projetComplet({ localite: null, localisation: 'Pointe des Almadies' });

    it('propose le rattachement d’un dossier antérieur au référentiel', async () => {
      rendre(nonRattache());
      await historiqueCharge();
      expect(screen.getByText(/Libellé saisi à la création : « Pointe des Almadies »/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Rattacher' })).toBeDisabled();
    });

    it('ne propose pas le rattachement sans droit d’écriture', async () => {
      rendre(nonRattache(), { peutEcrire: false });
      await historiqueCharge();
      expect(screen.queryByRole('button', { name: 'Rattacher' })).not.toBeInTheDocument();
    });

    it('ne propose pas le rattachement d’un lead archivé', async () => {
      rendre(projetComplet({ localite: null, archive: ARCHIVE }));
      await historiqueCharge();
      expect(screen.queryByRole('button', { name: 'Rattacher' })).not.toBeInTheDocument();
    });

    it('rattache le dossier à la localité choisie', async () => {
      const { user, onRattacher } = rendre(nonRattache());
      await user.type(screen.getByRole('combobox', { name: 'Rattacher au référentiel des localités' }), 'Ngor');
      await user.click(screen.getByRole('option', { name: /Ngor/ }));
      await user.click(screen.getByRole('button', { name: 'Rattacher' }));
      expect(onRattacher).toHaveBeenCalledWith('loc-ngo');
    });

    it('affiche « Rattachement… » pendant l’envoi puis l’erreur du serveur', async () => {
      const envoi = differe<void>();
      const { user, onRattacher } = rendre(nonRattache());
      onRattacher.mockReturnValue(envoi.promesse);
      await user.type(screen.getByRole('combobox', { name: 'Rattacher au référentiel des localités' }), 'Ngor');
      await user.click(screen.getByRole('option', { name: /Ngor/ }));
      await user.click(screen.getByRole('button', { name: 'Rattacher' }));
      expect(screen.getByRole('button', { name: 'Rattachement…' })).toBeDisabled();
      envoi.rejeter(new Error('Localité inconnue.'));
      expect(await screen.findByText('Localité inconnue.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Rattacher' })).toBeEnabled();
    });

    it('affiche un message générique quand l’erreur n’a pas de texte', async () => {
      const { user, onRattacher } = rendre(nonRattache());
      onRattacher.mockRejectedValue(new Error(''));
      await user.type(screen.getByRole('combobox', { name: 'Rattacher au référentiel des localités' }), 'Ngor');
      await user.click(screen.getByRole('option', { name: /Ngor/ }));
      await user.click(screen.getByRole('button', { name: 'Rattacher' }));
      expect(await screen.findByText('Le rattachement a échoué.')).toBeInTheDocument();
    });
  });

  describe('réassignation du propriétaire', () => {
    const choix = () => screen.getByRole('combobox', { name: 'Propriétaire de la fiche' });

    it('propose les titulaires Dir. GC, le propriétaire actuel sélectionné', async () => {
      rendre(projetComplet());
      await historiqueCharge();
      expect(choix()).toHaveValue('u-dirgc');
      expect(
        within(choix())
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Awa Ndiaye', 'Ibrahima Sall']);
    });

    it('propose « À assigner… » tant que le dossier n’a pas de propriétaire', async () => {
      rendre(projetComplet({ proprietaire: null }));
      await historiqueCharge();
      expect(choix()).toHaveValue('');
      expect(within(choix()).getByRole('option', { name: 'À assigner…' })).toBeInTheDocument();
    });

    it('réassigne le dossier au titulaire choisi', async () => {
      const { user, onChangerProprietaire } = rendre(projetComplet());
      await user.selectOptions(choix(), 'u-dirgc-2');
      expect(onChangerProprietaire).toHaveBeenCalledWith('u-dirgc-2');
    });

    it('désactive la liste pendant la réassignation', async () => {
      const envoi = differe<void>();
      const { user, onChangerProprietaire } = rendre(projetComplet());
      onChangerProprietaire.mockReturnValue(envoi.promesse);
      await user.selectOptions(choix(), 'u-dirgc-2');
      expect(choix()).toBeDisabled();
      envoi.resoudre();
      await waitFor(() => expect(choix()).toBeEnabled());
    });

    it('affiche l’erreur de la réassignation', async () => {
      const { user, onChangerProprietaire } = rendre(projetComplet());
      onChangerProprietaire.mockRejectedValue(new Error('Ce compte n’est pas Dir. GC.'));
      await user.selectOptions(choix(), 'u-dirgc-2');
      expect(await screen.findByText('Ce compte n’est pas Dir. GC.')).toBeInTheDocument();
      expect(choix()).toBeEnabled();
    });

    it('affiche un message générique quand l’erreur de réassignation n’a pas de texte', async () => {
      const { user, onChangerProprietaire } = rendre(projetComplet());
      onChangerProprietaire.mockRejectedValue('500');
      await user.selectOptions(choix(), 'u-dirgc-2');
      expect(await screen.findByText('La réassignation a échoué.')).toBeInTheDocument();
    });

    it('ne réassigne pas au propriétaire actuel', async () => {
      const { user, onChangerProprietaire } = rendre(projetComplet());
      await user.selectOptions(choix(), 'u-dirgc');
      expect(onChangerProprietaire).not.toHaveBeenCalled();
    });

    it('affiche le propriétaire en lecture sans droit de réassigner', async () => {
      rendre(projetComplet(), { peutReassigner: false });
      await historiqueCharge();
      expect(screen.queryByRole('combobox', { name: 'Propriétaire de la fiche' })).not.toBeInTheDocument();
      const carte = document.querySelector('.fiche-crm-carte--proprio') as HTMLElement;
      expect(within(carte).getByText('Awa Ndiaye')).toBeInTheDocument();
    });

    it('affiche le propriétaire en lecture pour un lead archivé', async () => {
      rendre(projetIncomplet({ archive: ARCHIVE }));
      await historiqueCharge();
      expect(screen.queryByRole('combobox', { name: 'Propriétaire de la fiche' })).not.toBeInTheDocument();
    });

    it('affiche le propriétaire en lecture quand la liste des titulaires est vide', async () => {
      rendre(projetComplet(), { proprietaires: [] });
      await historiqueCharge();
      expect(screen.queryByRole('combobox', { name: 'Propriétaire de la fiche' })).not.toBeInTheDocument();
    });
  });

  describe('offre & contrat', () => {
    it('affiche les équipes d’un projet onboard, modifiables selon le droit « équipe »', async () => {
      niveauMock.mockReturnValue(true);
      rendre(projetComplet({ statut: 'onboard', projetId: 'prj-1', verrouillee: true }));
      await historiqueCharge();
      expect(screen.getByText('Équipes modifiables')).toBeInTheDocument();
    });

    it('n’affiche pas les équipes avant l’onboard', async () => {
      rendre(projetComplet({ statut: 'offre_envoyee', projetId: null, verrouillee: true }));
      await historiqueCharge();
      expect(screen.queryByText(/^Équipes/)).not.toBeInTheDocument();
    });

    it('propose la facture directe à qui peut facturer', async () => {
      rendre(projetComplet(), { peutFacturer: true });
      await historiqueCharge();
      expect(screen.getByRole('link', { name: 'Émettre une facture directe (Finances)' })).toHaveAttribute(
        'href',
        `/admin/${SLUG}/facturation?nouvelle=p-1`,
      );
    });
  });
});
