import type {
  Client,
  NouveauProjetPayload,
  Projet,
  ProjetExecution,
  StatutCrm,
} from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// CRM — dossiers immobiliers & clients. Branché sur l'API NestJS :
//   GET   /api/societes/:slug/dossiers
//   GET   /api/societes/:slug/clients
//   POST  /api/societes/:slug/dossiers      (crée aussi le client si `nouveau`)
//   PATCH /api/societes/:slug/dossiers/:id   { statut }
// Passer un dossier à « validé » déclenche la transaction pivot côté serveur
// (création du projet d'exécution + coquille avant-projet, idempotente).
// -----------------------------------------------------------------------------

export function getProjets(slug: string): Promise<Projet[]> {
  return apiSociete<Projet[]>(slug, '/dossiers');
}

export function getClients(slug: string): Promise<Client[]> {
  return apiSociete<Client[]>(slug, '/clients');
}

export function creerProjet(
  slug: string,
  payload: NouveauProjetPayload,
): Promise<Projet> {
  return apiSociete<Projet>(slug, '/dossiers', { method: 'POST', body: payload });
}

// Modifie le statut d'un dossier. Le passage à « validé » crée le projet
// d'exécution côté serveur ; `projetCree` le porte (null sinon / déjà créé).
export function changerStatut(
  slug: string,
  id: string,
  statut: StatutCrm,
): Promise<{ projet: Projet; projetCree: ProjetExecution | null }> {
  return apiSociete(slug, `/dossiers/${id}`, {
    method: 'PATCH',
    body: { statut },
  });
}
