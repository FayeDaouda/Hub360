import type { FluxNotifications, NotificationItem, Session } from './types';
import { apiSociete } from './client-api';
import { niveauSuffisant } from './auth';

// Notifications du collaborateur connecté. API NestJS :
//   GET   /api/societes/:slug/notifications          → { nonLues, elements[] }
//   PATCH /api/societes/:slug/notifications/lecture   → marque toutes lues
// Les alertes d'échéance d'avant-projet sont dérivées côté serveur (non
// stockées), renvoyées avec `derivee: true` en tête du flux.

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
//   · sinon → la fiche projet (notifications d'exécution, admin).
export function lienNotificationAdmin(
  slug: string,
  n: Pick<NotificationItem, 'type' | 'projetId' | 'dossierCrmId'>,
  session: Session | null,
): string | null {
  if (n.type === 'contrat_signe' && n.projetId && niveauSuffisant(session, 'finances_factures', 'validation')) {
    return `/admin/${slug}/facturation?projetId=${n.projetId}&onglet=factures`;
  }
  if (n.dossierCrmId) return `/admin/${slug}/crm?dossier=${n.dossierCrmId}`;
  if (n.projetId) return `/admin/${slug}/projets/${n.projetId}`;
  return null;
}
