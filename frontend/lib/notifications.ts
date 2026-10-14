import type { FluxNotifications, NotificationItem, Session } from './types';
import { apiSociete } from './client-api';
import { niveauSuffisant } from './auth';
import { lienFacturationProjet } from './facturation';

// Notifications du collaborateur connecté. API NestJS :
//   GET   /api/societes/:slug/notifications          → { nonLues, elements[] }
//   PATCH /api/societes/:slug/notifications/lecture   → marque toutes lues
// Les alertes dérivées (relance d'un lead CRM incomplet après 72 h) sont
// calculées côté serveur (non stockées), renvoyées avec `derivee: true` en
// tête du flux.

export function getNotifications(slug: string): Promise<FluxNotifications> {
  return apiSociete<FluxNotifications>(slug, '/notifications');
}

export function marquerNotificationsLues(slug: string): Promise<FluxNotifications> {
  return apiSociete<FluxNotifications>(slug, '/notifications/lecture', {
    method: 'PATCH',
  });
}

// Cible d'une notification dans le back-office (cloche + toast admin).
//   · contrat signé → la page Facturation du projet pour qui ÉMET les
//     factures (finances_factures validation : la CFO) — ses brouillons l'y
//     attendent ; les autres destinataires ouvrent le dossier.
//   · cycle CRM → le dossier, ouvert dans le CRM (?dossier=).
//   · sinon → le projet, ouvert dans Projets (?projet=).
export function lienNotificationAdmin(
  slug: string,
  n: Pick<NotificationItem, 'type' | 'projetId' | 'dossierCrmId' | 'factureId'>,
  session: Session | null,
): string | null {
  if (n.type === 'contrat_signe' && n.projetId && niveauSuffisant(session, 'finances_factures', 'validation')) {
    return lienFacturationProjet(slug, n.projetId);
  }
  const base = `/admin/${slug}`;
  // Demandes RH : la RH traite dans RH › Demandes ; le N+1 décide dans Mon
  // espace › À valider ; le salarié suit ses demandes dans Mon espace.
  if (n.type === 'absence_a_decider') {
    return niveauSuffisant(session, 'rh', 'ecriture') ? `${base}/rh?onglet=demandes` : `${base}/mon-espace?onglet=a-valider`;
  }
  if (n.type === 'remboursement_a_traiter') return `${base}/rh?onglet=demandes`;
  if (n.type === 'absence_decidee') return `${base}/mon-espace?onglet=conges`;
  if (n.type === 'remboursement_traite') return `${base}/mon-espace?onglet=remboursements`;
  if (n.type === 'decision_assignee') return `${base}?onglet=registre`;
  if ((n.type === 'facture_emise' || n.type === 'facture_payee' || n.type === 'rappel_facture') && n.factureId) {
    return `${base}/facturation?facture=${n.factureId}`;
  }
  // Élément ajouté en TS : les devis du projet (l'avenant y est en préparation).
  if (n.type === 'avenant_ts' && n.projetId) return `${base}/facturation?projetId=${n.projetId}`;
  // Facture directe à valider : la facture ouverte dans Facturation (CFO).
  if (n.type === 'facture_a_valider') {
    return n.factureId ? `/admin/${slug}/facturation?facture=${n.factureId}` : `/admin/${slug}/facturation?onglet=factures`;
  }
  if (n.dossierCrmId) return `/admin/${slug}/crm?dossier=${n.dossierCrmId}`;
  // Mention dans un fil : le projet ouvert dans la vue « Projets · gabarit ».
  if (n.projetId) return `/admin/${slug}/projets?projet=${n.projetId}`;
  return null;
}

// Mention d'une alerte dérivée à la place de « il y a … » (elle n'a pas de
// moment d'envoi : elle tient tant que sa condition tient).
export function libelleAlerteDerivee(n: Pick<NotificationItem, 'type'>): string {
  return n.type === 'fiche_a_completer' ? 'Relance' : 'Échéance';
}
