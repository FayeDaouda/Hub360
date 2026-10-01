import type {
  CategorieSoins,
  DecisionN1,
  DemandeAbsence,
  DemandeRemboursement,
  MotifRefusAbsence,
  PreparationDecision,
  SoldeConges,
  StatutAbsence,
  StatutRemboursement,
  TypeAbsence,
} from './types';
import { apiSociete } from './client-api';

// RH · Demandes (lot 2). Salarié : /mon-espace ; N+1 : /absences ; RH : /rh/demandes.
type Fichier = { nom: string; url: string };

export const getMesDemandes = (slug: string) =>
  apiSociete<{ solde: SoldeConges; absences: DemandeAbsence[]; remboursements: DemandeRemboursement[] }>(slug, '/mon-espace/demandes');
export const deposerAbsence = (slug: string, corps: { type: TypeAbsence; dateDebut: string; dateFin: string; commentaire?: string; justificatif?: Fichier }) =>
  apiSociete<DemandeAbsence>(slug, '/mon-espace/absences', { method: 'POST', body: corps });
export const repondreAutresDates = (slug: string, id: string, accepte: boolean) =>
  apiSociete<DemandeAbsence>(slug, `/mon-espace/absences/${id}/reponse`, { method: 'POST', body: { accepte } });
export const retirerAbsence = (slug: string, id: string) =>
  apiSociete<DemandeAbsence>(slug, `/mon-espace/absences/${id}/retrait`, { method: 'POST', body: {} });
export const deposerRemboursement = (slug: string, corps: { categorie: CategorieSoins; beneficiaire: string; dateSoins: string; montant: number; justificatifs?: Fichier[] }) =>
  apiSociete<DemandeRemboursement>(slug, '/mon-espace/remboursements', { method: 'POST', body: corps });

// Demandes dont je suis le N+1 : en attente de ma décision, ou toutes (`toutes`).
export const getAbsencesAValider = (slug: string, toutes = false) =>
  apiSociete<DemandeAbsence[]>(slug, `/absences/a-valider${toutes ? '?toutes=1' : ''}`);
export const getPreparationDecision = (slug: string, id: string) =>
  apiSociete<PreparationDecision>(slug, `/absences/${id}/preparation`);
export const deciderAbsence = (
  slug: string,
  id: string,
  corps: { decision: DecisionN1; delegations?: { livrable: string; collaborateurId: string }[]; nonDelegables?: string[]; dateDebut?: string; dateFin?: string; motif?: MotifRefusAbsence; commentaire?: string },
) => apiSociete<DemandeAbsence>(slug, `/absences/${id}/decision`, { method: 'POST', body: corps });

// Attestation de travail demandée par un salarié (Mon espace), délivrée par la RH.
export type AttestationRh = {
  id: string;
  demandeLe: string;
  delivreeLe: string | null;
  nom: string | null;
  dossier: { id: string; prenom: string; nom: string; matricule: string };
};
export const getDemandesRh = (slug: string) =>
  apiSociete<{ absences: DemandeAbsence[]; remboursements: DemandeRemboursement[]; attestations: AttestationRh[] }>(slug, '/rh/demandes');
export const delivrerAttestation = (slug: string, id: string, fichier: { nom: string; url: string }) =>
  apiSociete<{ ok: true }>(slug, `/rh/demandes/attestations/${id}/delivrance`, { method: 'POST', body: fichier });
export const validerAbsenceRh = (slug: string, id: string, valide: boolean, motif?: string) =>
  apiSociete<DemandeAbsence>(slug, `/rh/demandes/absences/${id}/validation`, { method: 'POST', body: { valide, motif } });
export const transmettreRemboursement = (slug: string, id: string) =>
  apiSociete<DemandeRemboursement>(slug, `/rh/demandes/remboursements/${id}/transmission`, { method: 'POST', body: {} });
export const marquerRembourse = (slug: string, id: string, montantRembourse: number) =>
  apiSociete<DemandeRemboursement>(slug, `/rh/demandes/remboursements/${id}/remboursement`, { method: 'POST', body: { montantRembourse } });
export const rejeterRemboursement = (slug: string, id: string, motif: string) =>
  apiSociete<DemandeRemboursement>(slug, `/rh/demandes/remboursements/${id}/rejet`, { method: 'POST', body: { motif } });
export const getJustificatif = (slug: string, chemin: string) => apiSociete<{ nom: string; url: string }>(slug, chemin);

export const LIBELLE_TYPE_ABSENCE: Record<TypeAbsence, string> = {
  conge_paye: 'Congé payé',
  maladie: 'Maladie',
  permission_exceptionnelle: 'Permission exceptionnelle',
  autre: 'Autre',
};
export const STATUT_ABSENCE: Record<StatutAbsence, { libelle: string; pill: string }> = {
  attente_n1: { libelle: 'En attente du N+1', pill: 'pill--attention' },
  autres_dates: { libelle: 'Autres dates proposées', pill: 'pill--info' },
  accord_n1: { libelle: 'Accord N+1 · validation RH', pill: 'pill--info' },
  validee: { libelle: 'Validée', pill: 'pill--succes' },
  refusee: { libelle: 'Refusée', pill: 'pill--risque' },
  retiree: { libelle: 'Retirée', pill: 'pill--neutre' },
};
export const LIBELLE_MOTIF_REFUS: Record<MotifRefusAbsence, string> = {
  periode_critique: 'Période critique pour les projets',
  effectif_insuffisant: 'Effectif insuffisant sur la période',
  solde_insuffisant: 'Solde de congés insuffisant',
  autre: 'Autre',
};
export const LIBELLE_SOINS: Record<CategorieSoins, string> = {
  pharmacie: 'Pharmacie',
  consultation: 'Consultation',
  analyses_imagerie: 'Analyses / imagerie',
  hospitalisation: 'Hospitalisation',
  dentaire_optique: 'Dentaire / optique',
  autre: 'Autre',
};
export const STATUT_REMBOURSEMENT: Record<StatutRemboursement, { libelle: string; pill: string }> = {
  soumise: { libelle: 'Soumise', pill: 'pill--attention' },
  transmise: { libelle: 'Transmise à l’assurance', pill: 'pill--info' },
  remboursee: { libelle: 'Remboursée', pill: 'pill--succes' },
  rejetee: { libelle: 'Rejetée', pill: 'pill--risque' },
};
export const jjmm = (iso: string) => iso.split('-').reverse().join('/');

export async function telechargerJustificatif(slug: string, chemin: string) {
  const f = await getJustificatif(slug, chemin);
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.nom;
  a.click();
}
