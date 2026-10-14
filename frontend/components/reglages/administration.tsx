'use client';

import { useState } from 'react';
import { RolesPanel } from '@/components/admin/roles-panel';
import { LocalitesPanel } from '@/components/admin/localites-panel';
import { ParametresContratPanel } from '@/components/admin/parametres-contrat-panel';

type Onglet = 'roles' | 'localites' | 'contrats';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'roles', libelle: 'Rôles & permissions' },
  { cle: 'localites', libelle: 'Localités' },
  { cle: 'contrats', libelle: 'Contrats' },
];

// Réglages · Administration (ex-page « Paramètres ») — un onglet par domaine,
// chacun chargé indépendamment (pas de fetch groupé) : un onglet en échec ne
// bloque pas les autres. Ouvert à l'admin de la société et au CIO (super
// admin du HUB), tous deux via SocieteAdminOuCioGuard côté API.
export function Administration({ slug }: { slug: string }) {
  const [onglet, setOnglet] = useState<Onglet>('roles');

  return (
    <>
      <div className="admin-periode reg-admin-onglets" style={{ marginBottom: '1.1rem' }}>
        <div className="admin-periode-toggle" role="group" aria-label="Section des paramètres">
          {ONGLETS.map((o) => (
            <button
              key={o.cle}
              type="button"
              className={o.cle === onglet ? 'is-active' : ''}
              aria-pressed={o.cle === onglet}
              onClick={() => setOnglet(o.cle)}
            >
              {o.libelle}
            </button>
          ))}
        </div>
      </div>

      {onglet === 'roles' && <RolesPanel slug={slug} />}
      {onglet === 'localites' && <LocalitesPanel slug={slug} />}
      {onglet === 'contrats' && <ParametresContratPanel slug={slug} />}
    </>
  );
}
