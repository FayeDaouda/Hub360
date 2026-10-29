import { apiAuth } from './client-api';

// Interrupteurs de l'Administrateur HUB (Administration du HUB › Interrupteurs) :
//   GET /societes/:slug/interrupteurs                 modules de la société et maintenance du HUB
//   PUT /societes/:slug/interrupteurs/modules/:cle    { actif, motif }
//   PUT /societes/:slug/interrupteurs/maintenance     { actif, message, motif }

export type Interrupteurs = {
  modules: { cle: string; nom: string; actif: boolean; desactiveLe: string | null; motif: string | null }[];
  maintenance: { actif: boolean; message: string };
};

const base = (slug: string) => `/societes/${slug}/interrupteurs`;

export function getInterrupteurs(slug: string): Promise<Interrupteurs> {
  return apiAuth(base(slug));
}

export function basculerModule(slug: string, cle: string, actif: boolean, motif: string): Promise<Interrupteurs> {
  return apiAuth(`${base(slug)}/modules/${encodeURIComponent(cle)}`, { method: 'PUT', body: { actif, motif } });
}

export function basculerMaintenance(
  slug: string,
  actif: boolean,
  message: string,
  motif: string,
): Promise<Interrupteurs> {
  return apiAuth(`${base(slug)}/maintenance`, { method: 'PUT', body: { actif, message, motif } });
}
