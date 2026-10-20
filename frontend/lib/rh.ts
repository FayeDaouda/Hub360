import type {
  ChampsDossierPersonnel,
  DossierPersonnel,
  IntegrationSalarie,
  OptionsDossiers,
  TypeContrat,
  TypePieceDossier,
} from './types';
import { apiSociete } from './client-api';

// RH · Dossiers du personnel — API NestJS (module « rh » de la matrice) :
//   GET   …/rh/dossiers                 liste (groupe)
//   GET   …/rh/dossiers/options         sociétés + fiches d'équipe sans dossier
//   POST  …/rh/dossiers                 création (matricule GH-xxxx attribué)
//   PATCH …/rh/dossiers/:id             mise à jour partielle
//   POST  …/rh/dossiers/:id/archivage   { archive }
//   PUT   …/rh/dossiers/:id/pieces/:t   { nom, url (data URI) }
//   GET   …/rh/dossiers/:id/pieces/:t   → { nom, url }

export type MajDossier = Partial<ChampsDossierPersonnel> & {
  societeId?: string;
  collaborateurId?: string | null;
  utilisateurId?: string | null;
};

export const getDossiers = (slug: string) => apiSociete<DossierPersonnel[]>(slug, '/rh/dossiers');
export const getOptionsDossiers = (slug: string) => apiSociete<OptionsDossiers>(slug, '/rh/dossiers/options');
export const creerDossier = (slug: string, corps: MajDossier) =>
  apiSociete<DossierPersonnel>(slug, '/rh/dossiers', { method: 'POST', body: corps });
export const majDossier = (slug: string, id: string, corps: MajDossier) =>
  apiSociete<DossierPersonnel>(slug, `/rh/dossiers/${id}`, { method: 'PATCH', body: corps });
// Départ : tâches de projet encore ouvertes au nom du salarié, à confier à un
// collègue de sa société avant l'archivage.
export type TachesOuvertes = {
  taches: { id: string; libelle: string; statut: 'a_faire' | 'a_valider' | 'reprise'; finLe: string | null; carte: string; projet: string }[];
  candidats: { id: string; nom: string }[];
};
export const getTachesOuvertes = (slug: string, id: string) =>
  apiSociete<TachesOuvertes>(slug, `/rh/dossiers/${id}/taches-ouvertes`);
export const archiverDossier = (
  slug: string,
  id: string,
  archive: boolean,
  reaffectations?: { tacheId: string; collaborateurId: string }[],
) => apiSociete<DossierPersonnel>(slug, `/rh/dossiers/${id}/archivage`, { method: 'POST', body: { archive, reaffectations } });
// Changement de moyen de paiement demandé dans Mon espace : validé (appliqué
// à la paie) ou refusé.
export const deciderPaiement = (slug: string, id: string, valide: boolean) =>
  apiSociete<DossierPersonnel>(slug, `/rh/dossiers/${id}/paiement`, { method: 'POST', body: { valide } });
export const joindrePieceDossier = (slug: string, id: string, type: TypePieceDossier, nom: string, url: string) =>
  apiSociete<DossierPersonnel>(slug, `/rh/dossiers/${id}/pieces/${type}`, { method: 'PUT', body: { nom, url } });
export const getPieceDossier = (slug: string, id: string, type: TypePieceDossier) =>
  apiSociete<{ nom: string; url: string }>(slug, `/rh/dossiers/${id}/pieces/${type}`);

export const LIBELLE_CONTRAT: Record<TypeContrat, string> = { cdi: 'CDI', cdd: 'CDD', stage: 'Stage' };

export const PIECES: { type: TypePieceDossier; libelle: string; aide?: string }[] = [
  { type: 'piece_identite', libelle: 'Pièce d’identité', aide: 'CNI ou passeport' },
  { type: 'cv', libelle: 'CV' },
  { type: 'diplomes', libelle: 'Diplômes' },
  { type: 'contrat_signe', libelle: 'Contrat de travail signé' },
  { type: 'fiche_poste', libelle: 'Fiche de poste' },
  { type: 'rib_ou_attestation', libelle: 'RIB ou attestation Wave / Orange Money' },
  { type: 'certificat_residence', libelle: 'Certificat de résidence' },
  { type: 'photo_identite', libelle: 'Photo d’identité' },
  { type: 'carte_ipm', libelle: 'Carte IPM / assurance' },
];

// Fin de contrat dans moins de 6 mois (CDD, stage) — à anticiper.
export function finProche(d: DossierPersonnel, aujourdhui = new Date()): boolean {
  if (!d.dateFin || d.typeContrat === 'cdi' || d.archiveLe) return false;
  const fin = new Date(`${d.dateFin}T00:00:00`);
  const limite = new Date(aujourdhui);
  limite.setMonth(limite.getMonth() + 6);
  return fin <= limite;
}

// RH · Intégration des nouveaux arrivants (lot 3) : points J30/J60/J90.
export const getIntegrations = (slug: string) => apiSociete<IntegrationSalarie[]>(slug, '/rh/integrations');
export const enregistrerPointIntegration = (slug: string, dossierId: string, jalon: number, corps: { realiseLe: string; compteRendu: string }) =>
  apiSociete<IntegrationSalarie>(slug, `/rh/integrations/${dossierId}/points/${jalon}`, { method: 'POST', body: corps });
export const confirmerIntegration = (slug: string, dossierId: string) =>
  apiSociete<{ id: string; confirmeLe: string }>(slug, `/rh/integrations/${dossierId}/confirmation`, { method: 'POST', body: {} });

// Bulletins de paie (lot 5b) : un par mois (AAAA-MM), remplaçable, retirable.
export const deposerBulletin = (slug: string, id: string, mois: string, nom: string, url: string) =>
  apiSociete<DossierPersonnel>(slug, `/rh/dossiers/${id}/bulletins/${mois}`, { method: 'PUT', body: { nom, url } });
// Paie (revue RH 20/10/2026) : le salaire s'affiche à la demande (tracé au
// journal d'audit) ; la masse salariale est un total calculé par le serveur.
export const getSalaireDossier = (slug: string, id: string) => apiSociete<{ salaireBase: number | null }>(slug, `/rh/dossiers/${id}/salaire`);
export const getMasseSalariale = (slug: string) =>
  apiSociete<{ masse: number; renseignes: number; total: number }>(slug, '/rh/dossiers/masse-salariale');
export const getBulletin = (slug: string, id: string, mois: string) =>
  apiSociete<{ nom: string; url: string }>(slug, `/rh/dossiers/${id}/bulletins/${mois}`);
export const retirerBulletin = (slug: string, id: string, mois: string) =>
  apiSociete<DossierPersonnel>(slug, `/rh/dossiers/${id}/bulletins/${mois}`, { method: 'DELETE' });
