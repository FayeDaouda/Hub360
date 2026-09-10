import type {
  Categorie,
  Execution,
  Lot,
  OffreEntreprise,
  Reserve,
  SituationPaiement,
  TypeLot,
} from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Exécution / chantier (les deux catégories). API NestJS :
//   GET    …/projets/:id/execution
//   PATCH  …/execution/lots/:type
//   POST   …/execution/lots/:type/offres | /attribution | /situations
//   DELETE …/execution/lots/:type/offres/:offreId | /situations/:id
//   POST   …/execution/cr
//   PATCH  …/execution/reception
//   POST   …/execution/reserves     PATCH …/execution/reserves/:id
// La catégorie est dérivée du projet côté serveur — 5ᵉ/3ᵉ argument conservé
// pour les signatures d'appel existantes, non transmis.
// -----------------------------------------------------------------------------

const base = (projetId: string) => `/projets/${projetId}/execution`;

export function getExecution(
  slug: string,
  projetId: string,
  _categorie: Categorie = 'conception',
): Promise<Execution> {
  return apiSociete<Execution>(slug, base(projetId));
}

export function majLot(
  slug: string,
  projetId: string,
  type: TypeLot,
  patch: Partial<Omit<Lot, 'type' | 'offres' | 'situations'>>,
  _categorie: Categorie = 'conception',
): Promise<Execution> {
  return apiSociete<Execution>(slug, `${base(projetId)}/lots/${type}`, {
    method: 'PATCH',
    body: patch,
  });
}

// Suivi opérationnel d'un lot (statut, avancement, planning) — endpoint ouvert
// au collaborateur assigné. Le financier passe par majLot / attribuerLot (admin).
export function majLotSuivi(
  slug: string,
  projetId: string,
  type: TypeLot,
  patch: Partial<Pick<Lot, 'statut' | 'avancement' | 'dateDebut' | 'dateFinPrevue'>>,
): Promise<Execution> {
  return apiSociete<Execution>(slug, `${base(projetId)}/lots/${type}/suivi`, {
    method: 'PATCH',
    body: patch,
  });
}

export function ajouterOffre(
  slug: string,
  projetId: string,
  type: TypeLot,
  offre: Omit<OffreEntreprise, 'id'>,
): Promise<Execution> {
  return apiSociete<Execution>(slug, `${base(projetId)}/lots/${type}/offres`, {
    method: 'POST',
    body: offre,
  });
}

export function supprimerOffre(
  slug: string,
  projetId: string,
  type: TypeLot,
  offreId: string,
): Promise<Execution> {
  return apiSociete<Execution>(
    slug,
    `${base(projetId)}/lots/${type}/offres/${offreId}`,
    { method: 'DELETE' },
  );
}

export function attribuerLot(
  slug: string,
  projetId: string,
  type: TypeLot,
  entreprise: string,
  montant: number,
): Promise<Execution> {
  return apiSociete<Execution>(
    slug,
    `${base(projetId)}/lots/${type}/attribution`,
    { method: 'POST', body: { entreprise, montant } },
  );
}

export function ajouterSituation(
  slug: string,
  projetId: string,
  type: TypeLot,
  s: Omit<SituationPaiement, 'id' | 'numero'>,
): Promise<Execution> {
  return apiSociete<Execution>(
    slug,
    `${base(projetId)}/lots/${type}/situations`,
    { method: 'POST', body: s },
  );
}

export function supprimerSituation(
  slug: string,
  projetId: string,
  type: TypeLot,
  situationId: string,
): Promise<Execution> {
  return apiSociete<Execution>(
    slug,
    `${base(projetId)}/lots/${type}/situations/${situationId}`,
    { method: 'DELETE' },
  );
}

export function ajouterCrChantier(
  slug: string,
  projetId: string,
  texte: string,
  _auteur: string,
): Promise<Execution> {
  return apiSociete<Execution>(slug, `${base(projetId)}/cr`, {
    method: 'POST',
    body: { texte },
  });
}

export function majReception(
  slug: string,
  projetId: string,
  patch: Partial<Execution['reception']>,
): Promise<Execution> {
  return apiSociete<Execution>(slug, `${base(projetId)}/reception`, {
    method: 'PATCH',
    body: patch,
  });
}

export function ajouterReserve(
  slug: string,
  projetId: string,
  description: string,
): Promise<Execution> {
  return apiSociete<Execution>(slug, `${base(projetId)}/reserves`, {
    method: 'POST',
    body: { description },
  });
}

export function majReserve(
  slug: string,
  projetId: string,
  reserveId: string,
  patch: Partial<Omit<Reserve, 'id'>>,
): Promise<Execution> {
  return apiSociete<Execution>(
    slug,
    `${base(projetId)}/reserves/${reserveId}`,
    { method: 'PATCH', body: patch },
  );
}
