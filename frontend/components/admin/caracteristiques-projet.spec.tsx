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
  usage: 'residentiel',
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
    gamme: 'local',
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
