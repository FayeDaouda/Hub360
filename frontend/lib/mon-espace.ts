import type { MaCellule, ModePaiementSalaire, ProfilMonEspace, TypePieceDossier } from './types';
import type { MyTask, PerformanceStats, TaskStatus } from '@/features/my-tasks/types';
import { apiSociete } from './client-api';
import { telechargerFichier } from './fichiers';
import { daysBetween, formatDayMonth } from '@hub/domain';

// RH · Mon espace (lot 5) — API NestJS, dossier du compte connecté :
//   GET   …/mon-espace                  { dossier | null }
//   PATCH …/mon-espace/coordonnees      { telephone?, contactUrgence? }
//   GET   …/mon-espace/documents/:type  { nom, url }
//   GET   …/mon-espace/bulletins/:mois  { nom, url }
//   GET   …/mon-espace/cellule          { cellule | null }

// Sans cellule : `cellule: null`, compteurs à zéro.
export const getMaCellule = (slug: string) =>
  apiSociete<{ cellule: MaCellule | null; stats: PerformanceStats }>(slug, '/mon-espace/cellule');
export const getMonEspace = (slug: string) => apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace');
// « Mes informations » : enregistrées immédiatement, champ par champ.
export type ChampsPersonnels = Partial<
  Pick<
    ProfilMonEspace,
    | 'telephone'
    | 'emailPerso'
    | 'situationFamiliale'
    | 'enfantsACharge'
    | 'adresse'
    | 'contactUrgence'
    | 'telephoneUrgence'
  >
>;
export const majCoordonnees = (slug: string, corps: ChampsPersonnels) =>
  apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace/coordonnees', { method: 'PATCH', body: corps });
// Changement de moyen de paiement : soumis à la RH, appliqué après sa validation.
export const demanderPaiement = (
  slug: string,
  corps: { modePaiement: ModePaiementSalaire; coordonneesPaiement: string },
) => apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace/paiement', { method: 'POST', body: corps });

async function telecharger(slug: string, chemin: string) {
  const f = await apiSociete<{ nom: string; url: string }>(slug, chemin);
  telechargerFichier(f);
}
export const telechargerDocument = (slug: string, type: TypePieceDossier) =>
  telecharger(slug, `/mon-espace/documents/${type}`);
export const telechargerBulletin = (slug: string, mois: string) => telecharger(slug, `/mon-espace/bulletins/${mois}`);
export const telechargerAttestation = (slug: string, id: string) => telecharger(slug, `/mon-espace/attestations/${id}`);
export const demanderAttestation = (slug: string) =>
  apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace/attestations', { method: 'POST', body: {} });

export const LIBELLE_PAIEMENT_SALAIRE: Record<ModePaiementSalaire, string> = {
  virement: 'Virement',
  wave: 'Wave',
  orange_money: 'Orange Money',
};

export const STATUT_TACHE: Record<TaskStatus, { libelle: string; pill: string }> = {
  validee: { libelle: 'Validée', pill: 'pill--succes' },
  remise: { libelle: 'Remis · à valider', pill: 'pill--info' },
  a_reprendre: { libelle: 'À reprendre', pill: 'pill--risque' },
  en_retard: { libelle: 'En retard', pill: 'pill--risque' },
  prolongee: { libelle: 'Prolongée', pill: 'pill--attention' },
  bloquee: { libelle: 'Attend l’étape précédente', pill: 'pill--neutre' },
  en_cours: { libelle: 'En cours', pill: 'pill--info' },
  a_venir: { libelle: 'À venir', pill: 'pill--neutre' },
  a_planifier: { libelle: 'À planifier', pill: 'pill--neutre' },
};

// Libellé du statut, précisé par la fenêtre quand la tâche est ouverte.
export function libelleStatut(t: MyTask, aujourdhui: string): string {
  if (t.statut === 'en_cours') {
    const reste = daysBetween(aujourdhui, t.echeance!);
    return reste === 0 ? 'Échéance aujourd’hui' : `Échéance dans ${reste} j`;
  }
  if (t.statut === 'a_venir') return `À venir · J-${daysBetween(aujourdhui, t.debut!)}`;
  if (t.statut === 'en_retard') return `En retard · ${daysBetween(t.echeance!, aujourdhui)} j`;
  if (t.statut === 'prolongee' && t.prolongeeJusquau) return `Prolongée jusqu’au ${formatDayMonth(t.prolongeeJusquau)}`;
  return STATUT_TACHE[t.statut].libelle;
}
