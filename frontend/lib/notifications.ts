import type { FluxNotifications } from './types';
import { apiSociete } from './client-api';

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
