'use client';

import { useState } from 'react';
import { RolesPanel } from '@/components/admin/roles-panel';
import { LocalitesPanel } from '@/components/admin/localites-panel';
import { ParametresContratPanel } from '@/components/admin/parametres-contrat-panel';
import { estAdministrateurHub } from '@/lib/acces-back-office';
import { useSessionCourante } from '@/lib/layout-contexte';
import { confirmLeave } from '@/components/unsaved-changes-guard';

type Onglet = 'roles' | 'localites' | 'contrats';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'roles', libelle: 'Droits des rôles' },
  { cle: 'localites', libelle: 'Localités' },
  { cle: 'contrats', libelle: 'Contrats' },
];

// Réglages · Administration (ex-page « Paramètres ») — un onglet par domaine,
// chacun chargé indépendamment (pas de fetch groupé) : un onglet en échec ne
// bloque pas les autres. Ouvert à l'admin de la société et au CIO (super
// admin du HUB), tous deux via SocieteAdminOuCioGuard côté API — sauf la
// matrice des droits, réservée au CIO et à l'Administrateur HUB (31/10/2026).
export function Administration({ slug }: { slug: string }) {
  const matrice = estAdministrateurHub(useSessionCourante());
  const onglets = ONGLETS.filter((o) => o.cle !== 'roles' || matrice);
  const [onglet, setOnglet] = useState<Onglet>(onglets[0].cle);

  return (
    <>
      <div className="admin-periode reg-admin-onglets" style={{ marginBottom: '1.1rem' }}>
        <div className="admin-periode-toggle" role="group" aria-label="Section des paramètres">
          {onglets.map((o) => (
            <button
              key={o.cle}
              type="button"
              className={o.cle === onglet ? 'is-active' : ''}
              aria-pressed={o.cle === onglet}
              // Droits non enregistrés : la fenêtre de garde demande d'abord.
              onClick={async () => {
                if (o.cle !== onglet && (await confirmLeave())) setOnglet(o.cle);
              }}
            >
              {o.libelle}
            </button>
          ))}
        </div>
      </div>

      {matrice && onglet === 'roles' && <RolesPanel key={slug} slug={slug} />}
      {onglet === 'localites' && <LocalitesPanel slug={slug} />}
      {onglet === 'contrats' && <ParametresContratPanel slug={slug} />}
    </>
  );
}
