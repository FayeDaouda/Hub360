import type {
  ApporteurSaisi,
  Client,
  Personne,
  ModifierFichePayload,
  NouveauProjetPayload,
  Projet,
  ProjetExecution,
  TransitionDossier,
} from './types';
import type { ActionCrm } from './cycle-crm';
import { apiSociete } from './client-api';
import { CATEGORIES } from './types';

// -----------------------------------------------------------------------------
// CRM — dossiers immobiliers & clients. Branché sur l'API NestJS :
//   GET   /api/societes/:slug/dossiers
//   GET   /api/societes/:slug/clients
//   POST  /api/societes/:slug/dossiers      (crée aussi le client si `nouveau`)
//   POST  /api/societes/:slug/dossiers/:id/actions   { action, commentaire? }
//   GET   /api/societes/:slug/dossiers/:id/historique
//   PATCH /api/societes/:slug/dossiers/:id/localite  { localiteId }
//   PATCH /api/societes/:slug/dossiers/:id/fiche     (complétion d'un lead)
//   POST  /api/societes/:slug/dossiers/:id/archivage
//   GET   /api/societes/:slug/dossiers/proprietaires-possibles
//   PATCH /api/societes/:slug/dossiers/:id/proprietaire  { proprietaireId }
//   PATCH /api/societes/:slug/dossiers/:id/apporteur     (COO seul)
// Passer un dossier à « onboard » déclenche la transaction pivot côté serveur
// (création du projet d'exécution + coquille avant-projet, idempotente).
// -----------------------------------------------------------------------------

// Vue commerciale du COO (revue COO, 22/10/2026) — backend crm/commercial.ts.
export type ElementCommercial = {
  type: 'fiche_incomplete' | 'lead_sans_proprietaire' | 'offre_chez_client' | 'apporteur_incomplet';
  dossierId: string;
  code: string;
  client: string;
  ton: 'risque' | 'attention' | 'info';
  detail: string;
  tri: string;
};
export type LignePerformance = { cle: string; libelle: string; type: 'interne' | 'externe' | 'direct'; leads: number; signes: number; enCours: number; signeHt: number };
export type EtapePipeline = 'preparation' | 'en_validation' | 'chez_client' | 'expiree' | 'signe' | 'perdu';
export type VueCommerciale = {
  aTraiter: ElementCommercial[];
  performance: {
    annee: string;
    montants: boolean; // droit « CRM — Totaux HT » (ou les offres) : signeHt renseignés
    leads: number;
    signes: number;
    signeHt: number;
    enCours: number;
    tauxTransformation: number | null;
    delaiMoyenJours: number | null;
    apporteurs: LignePerformance[];
  };
  // Totaux HT par étape, sans le détail des offres ; null sans le droit.
  pipelineHt: { etape: EtapePipeline; dossiers: number; avecOffre: number; totalHt: number }[] | null;
};
export function getVueCommerciale(slug: string, annee: string): Promise<VueCommerciale> {
  return apiSociete<VueCommerciale>(slug, `/dossiers/commercial?annee=${encodeURIComponent(annee)}`);
}

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

// Offre émise par la validation DAF — le lien clair n'existe qu'ici : repli
// à transmettre au client si l'email n'est pas parti.
export type OffreEmise = { reference: string | null; lienPublic: string; emailEnvoye: boolean };

// Fait avancer un dossier dans le cycle (cf. lib/cycle-crm.ts). Passer à
// « onboard » crée le projet d'exécution côté serveur ; `projetCree` le porte.
// « valider » envoie l'offre ; `offreEmise` le porte.
export function agirSurDossier(
  slug: string,
  id: string,
  action: ActionCrm,
  commentaire?: string,
): Promise<{
  projet: Projet;
  projetCree: ProjetExecution | null;
  offreEmise: OffreEmise | null;
  // Onboard : factures brouillon préparées depuis l'offre (échéanciers CGV).
  facturesPreparees: number;
}> {
  return apiSociete(slug, `/dossiers/${id}/actions`, {
    method: 'POST',
    body: { action, commentaire },
  });
}

// Journal du cycle d'un dossier, du plus ancien au plus récent.
export function getHistorique(slug: string, id: string): Promise<TransitionDossier[]> {
  return apiSociete<TransitionDossier[]>(slug, `/dossiers/${id}/historique`);
}

// Rattache un dossier antérieur au référentiel à une localité (une seule
// fois — 409 s'il est déjà rattaché). Ne change ni son code ni son libellé.
export function rattacherLocalite(
  slug: string,
  id: string,
  localiteId: string,
): Promise<Projet> {
  return apiSociete(slug, `/dossiers/${id}/localite`, {
    method: 'PATCH',
    body: { localiteId },
  });
}

// Titulaires du rôle Dir. GC de la société — propriétaires possibles d'un
// dossier (choix à la création s'ils sont plusieurs, réassignation).
export function getProprietairesPossibles(slug: string): Promise<Personne[]> {
  return apiSociete<Personne[]>(slug, '/dossiers/proprietaires-possibles');
}

// Champ par champ, tant que la fiche n'est pas verrouillée (« Nouveau projet »).
export function modifierFiche(slug: string, id: string, champs: ModifierFichePayload): Promise<Projet> {
  return apiSociete(slug, `/dossiers/${id}/fiche`, { method: 'PATCH', body: champs });
}

// Définitif : Direction GC ou CIO, lead en « Nouveau projet » seulement.
export function archiverDossier(slug: string, id: string): Promise<Projet> {
  return apiSociete(slug, `/dossiers/${id}/archivage`, { method: 'POST' });
}

// Fiche apporteur verrouillée depuis la création : le COO seul la modifie
// (le serveur le vérifie).
export function modifierApporteur(slug: string, id: string, apporteur: ApporteurSaisi): Promise<Projet> {
  return apiSociete(slug, `/dossiers/${id}/apporteur`, { method: 'PATCH', body: apporteur });
}

export function changerProprietaire(
  slug: string,
  id: string,
  proprietaireId: string,
): Promise<Projet> {
  return apiSociete(slug, `/dossiers/${id}/proprietaire`, {
    method: 'PATCH',
    body: { proprietaireId },
  });
}

// Complétude d'une fiche (registre CRM, maquette du boss) : les 10 champs —
// code, catégorie, localisation (rattachée au référentiel), type, surface du
// terrain, n° de planches, client, standing, gamme, programme. Les libellés
// manquants alimentent le rappel « il manque … » de la fiche.
// Catégorie affichée (maquette) : « Développement » = promotion interne ;
// null = « À choisir » (lead créé sans catégorie).
export function libelleCategorie(p: Projet): string | null {
  // « Développement » est une catégorie à part entière (doc oct. 2026),
  // indépendante de la nature de la mission ; null = « À choisir ».
  return p.categorie ? CATEGORIES[p.categorie] : null;
}

export function completudeFiche(p: Projet): { faits: number; total: number; manquants: string[] } {
  const champs: [string, boolean][] = [
    ['code projet', !!p.code],
    ['catégorie', !!p.categorie],
    ['localisation', !!p.localite],
    ['type de projet', !!p.type],
    ['surface du terrain', p.surfaceTerrain > 0],
    ['n° de planches', p.nbPlanches > 0],
    ['client', !!p.client],
    ['standing', !!p.standing],
    ['gamme', !!p.gamme],
    ['programme', !!p.programme.trim()],
  ];
  const manquants = champs.filter(([, ok]) => !ok).map(([nom]) => nom);
  return { faits: champs.length - manquants.length, total: champs.length, manquants };
}
