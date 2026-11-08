import { apiAuth } from './client-api';

// Interrupteurs de l'Administrateur HUB et du CIO (Administration du HUB › Modules) :
//   GET /societes/:slug/interrupteurs                 modules de la société et maintenance du HUB
//   PUT /societes/:slug/interrupteurs/modules/:cle    { actif, motif }
//   PUT /societes/:slug/interrupteurs/maintenance     { actif, message, motif }

export type Interrupteurs = {
  modules: { cle: string; nom: string; actif: boolean; desactiveLe: string | null; motif: string | null }[];
  maintenance: {
    actif: boolean;
    message: string;
    // Dernière fermeture ou réouverture du HUB (null : jamais basculée).
    depuis: { le: string; par: string | null } | null;
  };
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

// Écran « Modules » (lot 10, 31/10/2026) : catalogue du HUB par famille.
export type CatalogueModules = {
  familles: {
    nom: string;
    modules: {
      nom: string;
      statut: 'en_service' | 'en_partie' | 'a_venir';
      note: string | null;
      module: { cle: string; actif: boolean } | null;
    }[];
  }[];
};
export const getCatalogueModules = (slug: string): Promise<CatalogueModules> => apiAuth(`${base(slug)}/catalogue`);
