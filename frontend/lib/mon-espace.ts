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

// RH · Mon espace (lot 5) — API NestJS, dossier du compte connecté :
//   GET   …/mon-espace                  { dossier | null }
//   PATCH …/mon-espace/coordonnees      { telephone?, contactUrgence? }
//   GET   …/mon-espace/documents/:type  { nom, url }
//   GET   …/mon-espace/bulletins/:mois  { nom, url }
//   GET   …/mon-espace/cellule          { cellule | null }

export const getMaCellule = (slug: string) => apiSociete<{ cellule: MaCellule | null }>(slug, '/mon-espace/cellule');
export const getMonEspace = (slug: string) => apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace');
export const majCoordonnees = (slug: string, corps: { telephone?: string; contactUrgence?: string }) =>
  apiSociete<{ dossier: ProfilMonEspace | null }>(slug, '/mon-espace/coordonnees', { method: 'PATCH', body: corps });

async function telecharger(slug: string, chemin: string) {
  const f = await apiSociete<{ nom: string; url: string }>(slug, chemin);
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.nom;
  a.click();
}
export const telechargerDocument = (slug: string, type: TypePieceDossier) => telecharger(slug, `/mon-espace/documents/${type}`);
export const telechargerBulletin = (slug: string, mois: string) => telecharger(slug, `/mon-espace/bulletins/${mois}`);

export const LIBELLE_PAIEMENT_SALAIRE: Record<ModePaiementSalaire, string> = {
  virement: 'Virement',
  wave: 'Wave',
  orange_money: 'Orange Money',
};

// Remise et validation des tâches (lot 5c).
//   GET  …/mon-espace/taches                                  mes tâches + stats
//   POST …/mon-espace/taches/:section/:projetId/:groupe/remise
//   GET  …/taches/a-valider                                   file du N+1
//   POST …/taches/:section/:projetId/:groupe/decision         { decision, motif? }
type MesTaches = { taches: TacheMonEspace[]; stats: StatsPerformances };
const chemin = (t: { section: string; projetId: string; groupe: string }) => `${t.section}/${t.projetId}/${t.groupe}`;

export const getMesTaches = (slug: string) => apiSociete<MesTaches>(slug, '/mon-espace/taches');
export const remettreTache = (slug: string, t: TacheMonEspace) =>
  apiSociete<MesTaches>(slug, `/mon-espace/taches/${chemin(t)}/remise`, { method: 'POST', body: {} });
export const getTachesAValider = (slug: string) => apiSociete<TacheAValider[]>(slug, '/taches/a-valider');
export const deciderTache = (slug: string, t: TacheAValider, decision: 'valider' | 'renvoyer', motif?: string) =>
  apiSociete<TacheAValider[]>(slug, `/taches/${chemin(t)}/decision`, { method: 'POST', body: { decision, motif } });

export const STATUT_TACHE: Record<StatutTache, { libelle: string; pill: string }> = {
  validee: { libelle: 'Validée', pill: 'pill--succes' },
  remise: { libelle: 'Remis · à valider', pill: 'pill--info' },
  a_reprendre: { libelle: 'À reprendre', pill: 'pill--risque' },
  en_retard: { libelle: 'En retard', pill: 'pill--risque' },
  en_cours: { libelle: 'En cours', pill: 'pill--info' },
  a_venir: { libelle: 'À venir', pill: 'pill--neutre' },
  a_planifier: { libelle: 'À planifier', pill: 'pill--neutre' },
};
