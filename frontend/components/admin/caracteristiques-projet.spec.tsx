import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Projet } from '@/lib/types';
import { CaracteristiquesProjet } from './caracteristiques-projet';

// Fiche figée modifiable (09/11/2026) : avec `prixFige`, les champs qui fixent
// le prix de l'offre (catégorie, surface, planches) et la forme bâtie
// (désignation sur les factures) sont grisés ; une réponse qui changerait le
// calcul des planches est refusée avant l'envoi ; un refus du serveur ramène
// la fiche à la dernière version acceptée.

vi.setConfig({ testTimeout: 30_000 });

// Villa R+1 + 1 sous-sol : 3 planches calculées (cf. lib/fiche-programme).
const VILLA = {
  typeProjet: 'residentiel',
  usage: 'maisons_individuelles',
  forme: 'villa',
  gabarit: 1,
  sousSols: 1,
  typologieVilla: 'F5',
} as unknown as NonNullable<Projet['ficheProgramme']>;

const dossier = (champs: Partial<Projet> = {}): Projet =>
  ({
    id: 'p-1',
    code: 'DFS_ALM.26',
    nature: 'mandat_client',
    categorie: 'conception',
    localisation: 'Almadies',
    localite: { id: 'loc-alm', code: 'ALM', nom: 'Almadies' },
    nbPlanches: 3,
    surfaceTerrain: 450,
    client: { id: 'cli-1', nom: 'Daouda Faye Sow', type: 'particulier' },
    standing: 'moyen',
    gamme: 'economique',
    programme: 'Villa R+1 · 1 sous-sol · F5',
    ficheProgramme: VILLA,
    statut: 'en_validation',
    projetId: null,
    verrouillee: true,
    archive: null,
    ...champs,
  }) as Projet;

describe('CaracteristiquesProjet · fiche figée (prixFige)', () => {
  it('grise catégorie, surface, forme bâtie et annonce la règle', () => {
    render(<CaracteristiquesProjet projet={dossier()} onModifier={vi.fn()} prixFige />);
    expect(screen.getByLabelText('Catégorie')).toBeDisabled();
    expect(screen.getByLabelText('Surface du terrain (m²)')).toBeDisabled();
    expect(screen.getByLabelText(/Forme/)).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('Fiche figée, modifiable avec ton droit.');
  });

  it('standing et gamme restent modifiables et partent au serveur', async () => {
    const user = userEvent.setup();
    const onModifier = vi.fn().mockResolvedValue(undefined);
    render(<CaracteristiquesProjet projet={dossier()} onModifier={onModifier} prixFige />);
    await user.selectOptions(screen.getByLabelText('Standing'), 'grand');
    await waitFor(() => expect(onModifier).toHaveBeenCalledWith({ standing: 'grand' }));
  });

  it('gabarit R+1 → R+2 (planches 3 → 4) : refusé avant l’envoi, fiche inchangée', async () => {
    const user = userEvent.setup();
    const onModifier = vi.fn().mockResolvedValue(undefined);
    render(<CaracteristiquesProjet projet={dossier()} onModifier={onModifier} prixFige />);
    const gabarit = document.getElementById('fiche-gabarit') as HTMLSelectElement;
    await user.selectOptions(gabarit, '2');
    expect(await screen.findByText(/Nombre de planches : figé après la soumission/)).toBeInTheDocument();
    expect(onModifier).not.toHaveBeenCalled();
    expect(gabarit.value).toBe('1');
  });

  it('refus du serveur : retour à la dernière fiche acceptée', async () => {
    const user = userEvent.setup();
    const onModifier = vi.fn().mockRejectedValue(new Error('Fiche Programme incomplète'));
    render(<CaracteristiquesProjet projet={dossier()} onModifier={onModifier} prixFige />);
    await user.selectOptions(screen.getByLabelText(/Typologie/), 'F4');
    expect(await screen.findByText('Fiche Programme incomplète')).toBeInTheDocument();
    expect((screen.getByLabelText(/Typologie/) as HTMLSelectElement).value).toBe('F5');
  });

  it('sans prixFige (« Nouveau projet ») : rien n’est grisé, pas de bandeau', () => {
    render(
      <CaracteristiquesProjet
        projet={dossier({ statut: 'nouveau_projet', verrouillee: false })}
        onModifier={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Catégorie')).toBeEnabled();
    expect(screen.getByLabelText(/Forme/)).toBeEnabled();
    expect(screen.queryByRole('note')).toBeNull();
  });
});

// Type de projet et usage (09/11/2026) : le type fixe la liste des usages ;
// changer de type efface l'usage ; « Mixte » se décrit à la main.
describe('CaracteristiquesProjet · type de projet et usage', () => {
  const nouveau = (fiche: object) =>
    dossier({
      statut: 'nouveau_projet',
      verrouillee: false,
      ficheProgramme: fiche as NonNullable<Projet['ficheProgramme']>,
    });

  it('l’usage propose la liste du type choisi', () => {
    render(<CaracteristiquesProjet projet={nouveau(VILLA)} onModifier={vi.fn()} />);
    const usage = screen.getByLabelText('A · Usage');
    expect(usage).toHaveValue('maisons_individuelles');
    const options = [...usage.querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toContain('Logements collectifs');
    expect(options).not.toContain('Hôtels');
  });

  it('sans type, l’usage attend le type', () => {
    render(<CaracteristiquesProjet projet={nouveau({ forme: 'villa' })} onModifier={vi.fn()} />);
    expect(screen.getByLabelText('A · Usage')).toBeDisabled();
    expect(screen.getByLabelText('A · Usage')).toHaveTextContent('Choisir d’abord le type');
  });

  it('changer de type efface l’usage et part au serveur', async () => {
    const user = userEvent.setup();
    const onModifier = vi.fn().mockResolvedValue(undefined);
    render(<CaracteristiquesProjet projet={nouveau(VILLA)} onModifier={onModifier} />);
    await user.selectOptions(screen.getByLabelText('A · Type de projet'), 'commercial');
    await waitFor(() =>
      expect(onModifier).toHaveBeenCalledWith({
        ficheProgramme: expect.objectContaining({ typeProjet: 'commercial', usage: null }),
      }),
    );
    expect(screen.getByLabelText('A · Usage')).toHaveValue('');
  });

  it('Mixte : usage écrit à la main, enregistré en quittant le champ', async () => {
    const user = userEvent.setup();
    const onModifier = vi.fn().mockResolvedValue(undefined);
    render(
      <CaracteristiquesProjet
        projet={nouveau({ ...VILLA, typeProjet: 'mixte', usage: null })}
        onModifier={onModifier}
      />,
    );
    const champ = screen.getByLabelText('A · Usage');
    await user.type(champ, 'Logements et commerces');
    expect(onModifier).not.toHaveBeenCalled();
    await user.tab();
    await waitFor(() =>
      expect(onModifier).toHaveBeenCalledWith({
        ficheProgramme: expect.objectContaining({ typeProjet: 'mixte', usage: 'Logements et commerces' }),
      }),
    );
  });
});

// Fiche figée : type de projet et usage ne fixent ni le prix ni la désignation
// sur les factures — ils restent modifiables avec le droit.
describe('CaracteristiquesProjet · type de projet et usage d’une fiche figée', () => {
  // Immeuble R+1 décrit en une ligne (RDC → R+1) : 1 planche calculée.
  const IMMEUBLE = {
    typeProjet: 'commercial',
    usage: 'commerces',
    forme: 'immeuble',
    gabarit: 1,
    sousSols: 0,
    composition: [{ de: 0, a: 1, usage: 'commerce', typologie: '', nb: 2 }],
  } as unknown as NonNullable<Projet['ficheProgramme']>;

  it('type et usage restent actifs, un autre usage part au serveur', async () => {
    const user = userEvent.setup();
    const onModifier = vi.fn().mockResolvedValue(undefined);
    render(<CaracteristiquesProjet projet={dossier()} onModifier={onModifier} prixFige />);
    expect(screen.getByLabelText('A · Type de projet')).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('A · Usage'), 'residences');
    await waitFor(() =>
      expect(onModifier).toHaveBeenCalledWith({
        ficheProgramme: expect.objectContaining({ typeProjet: 'residentiel', usage: 'residences' }),
      }),
    );
  });

  // Fiche figée : changer de type ne touche pas aux planches (calculées sur
  // le seul bâtiment) ; le nouveau type attend son usage avant de partir,
  // puis type et usage partent ensemble (la fiche reste complète).
  it('immeuble figé : changer de type n’annonce pas « Nombre de planches », part avec l’usage', async () => {
    const user = userEvent.setup();
    const onModifier = vi.fn().mockResolvedValue(undefined);
    render(
      <CaracteristiquesProjet
        projet={dossier({ ficheProgramme: IMMEUBLE, nbPlanches: 1, programme: 'Immeuble R+1 · 4 commerces' })}
        onModifier={onModifier}
        prixFige
      />,
    );
    await user.selectOptions(screen.getByLabelText('A · Type de projet'), 'industriel');
    expect(screen.queryByText(/Nombre de planches : figé/)).toBeNull();
    expect(screen.getByLabelText('A · Type de projet')).toHaveValue('industriel');
    expect(onModifier).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText('A · Usage'), 'entrepots');
    await waitFor(() =>
      expect(onModifier).toHaveBeenCalledWith({
        ficheProgramme: expect.objectContaining({ typeProjet: 'industriel', usage: 'entrepots' }),
      }),
    );
  });
});
