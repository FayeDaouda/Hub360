import type {
  MaCellule,
  ModePaiementSalaire,
  ProfilMonEspace,
  StatsPerformances,
  StatutTache,
  TacheAValider,
  TacheMonEspace,
  TypePieceDossier,
} from './types';
import { apiSociete } from './client-api';
import type { CorpsRemise } from './projets-ouverts';

// RH · Mon espace (lot 5) — API NestJS, dossier du compte connecté :
//   GET   …/mon-espace                  { dossier | null }
//   PATCH …/mon-espace/coordonnees      { telephone?, contactUrgence? }
//   GET   …/mon-espace/documents/:type  { nom, url }
//   GET   …/mon-espace/bulletins/:mois  { nom, url }
//   GET   …/mon-espace/cellule          { cellule | null }

// Sans cellule : `cellule: null`, compteurs à zéro.
export const getMaCellule = (slug: string) =>
  apiSociete<{ cellule: MaCellule | null; stats: StatsPerformances }>(slug, '/mon-espace/cellule');
export const getMonEspace = (slug: string) => apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace');
// « Mes informations » : enregistrées immédiatement, champ par champ.
export type ChampsPersonnels = Partial<
  Pick<ProfilMonEspace, 'telephone' | 'emailPerso' | 'situationFamiliale' | 'enfantsACharge' | 'adresse' | 'contactUrgence' | 'telephoneUrgence'>
>;
export const majCoordonnees = (slug: string, corps: ChampsPersonnels) =>
  apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace/coordonnees', { method: 'PATCH', body: corps });
// Changement de moyen de paiement : soumis à la RH, appliqué après sa validation.
export const demanderPaiement = (slug: string, corps: { modePaiement: ModePaiementSalaire; coordonneesPaiement: string }) =>
  apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace/paiement', { method: 'POST', body: corps });

async function telecharger(slug: string, chemin: string) {
  const f = await apiSociete<{ nom: string; url: string }>(slug, chemin);
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.nom;
  a.click();
}
export const telechargerDocument = (slug: string, type: TypePieceDossier) => telecharger(slug, `/mon-espace/documents/${type}`);
export const telechargerBulletin = (slug: string, mois: string) => telecharger(slug, `/mon-espace/bulletins/${mois}`);
export const telechargerAttestation = (slug: string, id: string) => telecharger(slug, `/mon-espace/attestations/${id}`);
export const demanderAttestation = (slug: string) =>
  apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace/attestations', { method: 'POST', body: {} });

export const LIBELLE_PAIEMENT_SALAIRE: Record<ModePaiementSalaire, string> = {
  virement: 'Virement',
  wave: 'Wave',
  orange_money: 'Orange Money',
};

// Remise et validation des tâches du gabarit (mêmes règles que Projets) :
//   GET  …/mon-espace/taches                              mes tâches + stats
//   POST …/mon-espace/taches/:projetId/:tacheId/remise
//   POST …/mon-espace/taches/:projetId/:tacheId/relance
//   GET  …/taches/a-valider                               remises qui m'attendent
//   POST …/taches/:projetId/:tacheId/decision             { decision, motif? }
type MesTaches = { taches: TacheMonEspace[]; stats: StatsPerformances };

export const getMesTaches = (slug: string) => apiSociete<MesTaches>(slug, '/mon-espace/taches');
export const remettreTache = (slug: string, t: TacheMonEspace, corps: CorpsRemise = {}) =>
  apiSociete<MesTaches>(slug, `/mon-espace/taches/${t.projetId}/${t.id}/remise`, { method: 'POST', body: corps });
// Relancer son validateur (3 jours ouvrés après le dépôt, puis après la relance précédente).
export const relancerTache = (slug: string, t: TacheMonEspace) =>
  apiSociete<MesTaches>(slug, `/mon-espace/taches/${t.projetId}/${t.id}/relance`, { method: 'POST' });
// Fichier d'une remise à valider (le valideur, ou l'assigné).
export const telechargerPieceRemise = (slug: string, t: TacheAValider, pieceId: string) =>
  telecharger(slug, `/taches/${t.projetId}/${t.id}/pieces/${pieceId}`);
export const getTachesAValider = (slug: string) => apiSociete<TacheAValider[]>(slug, '/taches/a-valider');
export const deciderTache = (slug: string, t: TacheAValider, decision: 'valider' | 'renvoyer', motif?: string) =>
  apiSociete<TacheAValider[]>(slug, `/taches/${t.projetId}/${t.id}/decision`, { method: 'POST', body: { decision, ...(motif ? { motif } : {}) } });

export const STATUT_TACHE: Record<StatutTache, { libelle: string; pill: string }> = {
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

export const ecartJours = (de: string, a: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

// Libellé du statut, précisé par la fenêtre quand la tâche est ouverte.
export function libelleStatut(t: TacheMonEspace, aujourdhui: string): string {
  if (t.statut === 'en_cours') {
    const reste = ecartJours(aujourdhui, t.echeance!);
    return reste === 0 ? 'Échéance aujourd’hui' : `Échéance dans ${reste} j`;
  }
  if (t.statut === 'a_venir') return `À venir · J-${ecartJours(aujourdhui, t.debut!)}`;
  if (t.statut === 'en_retard') return `En retard · ${ecartJours(t.echeance!, aujourdhui)} j`;
  if (t.statut === 'prolongee' && t.prolongeeJusquau) return `Prolongée jusqu’au ${t.prolongeeJusquau.slice(8, 10)}/${t.prolongeeJusquau.slice(5, 7)}`;
  return STATUT_TACHE[t.statut].libelle;
}
