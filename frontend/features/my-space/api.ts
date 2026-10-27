import { apiSociete } from '@/lib/client-api';
import { telechargerFichier } from '@/lib/fichiers';
import type { ReponseApi } from '@/lib/api/types';
import type { ContactDetails, EmployeeDocumentType, MyCellView, MySpaceView, PaymentChange } from './types';

// -----------------------------------------------------------------------------
// « Mon espace » — API NestJS (backend/src/my-space), dossier du compte connecté :
//   GET   …/mon-espace                     { dossier | null }
//   PATCH …/mon-espace/coordonnees         champs que la personne modifie elle-même
//   POST  …/mon-espace/paiement            changement de moyen de paiement (validé par la RH)
//   POST  …/mon-espace/attestations        attestation de travail demandée à la RH
//   GET   …/mon-espace/documents/:type     { nom, url }
//   GET   …/mon-espace/bulletins/:mois     { nom, url }
//   GET   …/mon-espace/attestations/:id    { nom, url }
//   GET   …/mon-espace/cellule             { cellule | null, stats }
// Les écritures renvoient le dossier à jour.
// -----------------------------------------------------------------------------

type Download = ReponseApi<'/api/societes/{slug}/mon-espace/documents/{type}', 'get'>;

export const getMySpace = (slug: string) => apiSociete<MySpaceView>(slug, '/mon-espace');

// Sans cellule : `cellule: null`, compteurs à zéro.
export const getMyCell = (slug: string) => apiSociete<MyCellView>(slug, '/mon-espace/cellule');

export const updateContactDetails = (slug: string, body: ContactDetails) =>
  apiSociete<MySpaceView>(slug, '/mon-espace/coordonnees', { method: 'PATCH', body });

export const requestPaymentChange = (slug: string, body: PaymentChange) =>
  apiSociete<MySpaceView>(slug, '/mon-espace/paiement', { method: 'POST', body });

export const requestCertificate = (slug: string) =>
  apiSociete<MySpaceView>(slug, '/mon-espace/attestations', { method: 'POST', body: {} });

async function download(slug: string, path: string) {
  telechargerFichier(await apiSociete<Download>(slug, path));
}
export const downloadDocument = (slug: string, type: EmployeeDocumentType) =>
  download(slug, `/mon-espace/documents/${type}`);
export const downloadPayslip = (slug: string, month: string) => download(slug, `/mon-espace/bulletins/${month}`);
export const downloadCertificate = (slug: string, id: string) => download(slug, `/mon-espace/attestations/${id}`);
