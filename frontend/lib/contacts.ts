import { apiSociete } from './client-api';

// GET /api/societes/:slug/contacts/:utilisateurId — fiche contact d'un
// collègue (annuaire de la société, tout compte du back-office).
export type FicheContact = {
  utilisateurId: string;
  prenom: string;
  nom: string;
  poste: string | null;
  cellule: string | null;
  chef: string | null; // chef d’équipe de sa cellule (null s'il l'est lui-même)
  estChef: boolean;
  telephone: string | null;
  email: string;
};

export const getFicheContact = (slug: string, utilisateurId: string) =>
  apiSociete<FicheContact>(slug, `/contacts/${utilisateurId}`);
