'use client';

import { useState } from 'react';
import { useTitrePage } from '@/lib/layout-contexte';
import { RolesPanel } from '@/components/admin/roles-panel';
import { GabaritFoncierPanel } from '@/components/admin/gabarit-foncier-panel';
import { GabaritEtudesPanel } from '@/components/admin/gabarit-etudes-panel';
import { LocalitesPanel } from '@/components/admin/localites-panel';
import { ParametresContratPanel } from '@/components/admin/parametres-contrat-panel';
import { DureesStandardPanel } from '@/components/admin/durees-standard-panel';

type Props = {
  params: { slug: string };
};

type Onglet = 'roles' | 'foncier' | 'etudes' | 'durees' | 'localites' | 'contrats';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'roles', libelle: 'Rôles & permissions' },
  { cle: 'foncier', libelle: 'Gabarit Foncier' },
  { cle: 'etudes', libelle: 'Gabarit Études' },
  { cle: 'durees', libelle: 'Durées standard' },
  { cle: 'localites', libelle: 'Localités' },
  { cle: 'contrats', libelle: 'Contrats' },
];

// Hub de configuration société — un onglet par domaine, chacun chargé
// indépendamment (pas de fetch groupé) : un onglet en échec ne bloque pas
// les autres. Ouvert à l'admin de la société et au CIO (super admin du HUB),
// tous deux via SocieteAdminOuCioGuard côté API.
export default function ParametresPage({ params }: Props) {
  useTitrePage('Paramètres');
  const [onglet, setOnglet] = useState<Onglet>('roles');

  return (
    <>
      <div className="admin-periode" style={{ marginBottom: '1.1rem' }}>
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

      {onglet === 'roles' && <RolesPanel slug={params.slug} />}
      {onglet === 'foncier' && <GabaritFoncierPanel slug={params.slug} />}
      {onglet === 'etudes' && <GabaritEtudesPanel slug={params.slug} />}
      {onglet === 'durees' && <DureesStandardPanel slug={params.slug} />}
      {onglet === 'localites' && <LocalitesPanel slug={params.slug} />}
      {onglet === 'contrats' && <ParametresContratPanel slug={params.slug} />}
    </>
  );
}
