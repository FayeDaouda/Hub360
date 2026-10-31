import { apiAuth } from './client-api';
import type { ReponseApi } from './api/types';

// Avis « Vos droits ont changé » de la personne connectée (matrice, 31/10/2026).
export type AvisDroits = ReponseApi<'/api/auth/moi/avis-droits', 'get'>[number];

export const getAvisDroits = () => apiAuth<AvisDroits[]>('/auth/moi/avis-droits');

export const marquerAvisCompris = () => apiAuth<void>('/auth/moi/avis-droits/compris', { method: 'POST', body: {} });

// Droits du moment, sans nouveau jeton (la session d'une personne inactive
// n'est pas prolongée pour autant).
export const getDroitsCourants = () => apiAuth<ReponseApi<'/api/auth/moi/droits', 'get'>>('/auth/moi/droits');
