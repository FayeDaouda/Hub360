import type {
  ContratDossier,
  ContratPublic,
  ParametresContrat,
  StatutAnnexeContrat,
} from './types';
import { apiPublic, apiSociete } from './client-api';

// Contrat d'un dossier CRM (étape G) — API NestJS :
//   GET/POST …/dossiers/:id/contrat            état / préparer
//   POST     …/contrat/generation              régénérer depuis le modèle
//   POST     …/contrat/document                déposer le contrat sur mesure
//   PATCH    …/contrat/annexes/:annexeId       joindre / « non nécessaire »
//   POST/DELETE …/contrat/envoi                envoyer / retirer l'envoi
//   POST     …/contrat/signature-papier        contrat papier scanné (Onboard)
//   …/parametres-contrat                       réglages société (admin / CIO)
//   contrats-public/:token                     lien client (sans compte)

type Fichier = { nom: string; url: string };
const base = (dossierId: string) => `/dossiers/${dossierId}/contrat`;

export function getContrat(slug: string, dossierId: string): Promise<ContratDossier> {
  return apiSociete<ContratDossier>(slug, base(dossierId));
}

export function preparerContrat(slug: string, dossierId: string): Promise<ContratDossier> {
  return apiSociete<ContratDossier>(slug, base(dossierId), { method: 'POST' });
}

export function regenererContrat(slug: string, dossierId: string): Promise<ContratDossier> {
  return apiSociete<ContratDossier>(slug, `${base(dossierId)}/generation`, { method: 'POST' });
}

export function deposerDocumentContrat(
  slug: string,
  dossierId: string,
  fichier: Fichier,
): Promise<ContratDossier> {
  return apiSociete<ContratDossier>(slug, `${base(dossierId)}/document`, {
    method: 'POST',
    body: fichier,
  });
}

export function majAnnexeContrat(
  slug: string,
  dossierId: string,
  annexeId: string,
  statut: StatutAnnexeContrat,
  fichier?: Fichier,
): Promise<ContratDossier> {
  return apiSociete<ContratDossier>(slug, `${base(dossierId)}/annexes/${annexeId}`, {
    method: 'PATCH',
    body: { statut, fichier },
  });
}

// Le lien clair n'existe qu'ici : repli à transmettre si l'email ne part pas.
export function envoyerContrat(
  slug: string,
  dossierId: string,
): Promise<ContratDossier & { lienPublic: string; emailEnvoye: boolean }> {
  return apiSociete(slug, `${base(dossierId)}/envoi`, { method: 'POST' });
}

export function retirerEnvoiContrat(slug: string, dossierId: string): Promise<ContratDossier> {
  return apiSociete<ContratDossier>(slug, `${base(dossierId)}/envoi`, { method: 'DELETE' });
}

export function signerContratPapier(
  slug: string,
  dossierId: string,
  scan: Fichier,
): Promise<ContratDossier & { facturesPreparees: number }> {
  return apiSociete(slug, `${base(dossierId)}/signature-papier`, { method: 'POST', body: scan });
}

// -- Réglages société -----------------------------------------------------------

export function getParametresContrat(slug: string): Promise<ParametresContrat> {
  return apiSociete<ParametresContrat>(slug, '/parametres-contrat');
}

export function majParametresContrat(
  slug: string,
  patch: Partial<Pick<ParametresContrat, 'modele' | 'signataireNom' | 'signataireFonction' | 'seuilSurMesureHt'>>,
): Promise<ParametresContrat> {
  return apiSociete<ParametresContrat>(slug, '/parametres-contrat', { method: 'PATCH', body: patch });
}

export function ajouterAnnexeGabarit(slug: string, libelle: string): Promise<ParametresContrat> {
  return apiSociete<ParametresContrat>(slug, '/parametres-contrat/annexes', {
    method: 'POST',
    body: { libelle },
  });
}

export function retirerAnnexeGabarit(slug: string, id: string): Promise<ParametresContrat> {
  return apiSociete<ParametresContrat>(slug, `/parametres-contrat/annexes/${id}`, {
    method: 'DELETE',
  });
}

// -- Lien public (client, sans compte) -----------------------------------------

export function getContratPublic(token: string): Promise<ContratPublic> {
  return apiPublic<ContratPublic>(`/contrats-public/${token}`);
}

// `cible` = 'document' (contrat sur mesure) ou l'id d'une annexe.
export function getFichierContratPublic(token: string, cible: string): Promise<Fichier> {
  return apiPublic<Fichier>(`/contrats-public/${token}/fichiers/${cible}`);
}

export function signerContrat(
  token: string,
  signature: { mode: 'bouton' | 'trace'; nom: string; signatureTrace?: string },
): Promise<ContratPublic> {
  return apiPublic<ContratPublic>(`/contrats-public/${token}/signature`, {
    method: 'POST',
    body: signature,
  });
}
