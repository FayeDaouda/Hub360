'use client';

import { useState } from 'react';
import { useTitrePage } from '@/lib/layout-contexte';
import { RolesPanel } from '@/components/admin/roles-panel';
import { GabaritFoncierPanel } from '@/components/admin/gabarit-foncier-panel';
import { GabaritEtudesPanel } from '@/components/admin/gabarit-etudes-panel';
import { LocalitesPanel } from '@/components/admin/localites-panel';
import { ParametresContratPanel } from '@/components/admin/parametres-contrat-panel';

type Props = {
  params: { slug: string };
};

type Onglet = 'roles' | 'foncier' | 'etudes' | 'localites' | 'contrats';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'roles', libelle: 'Rôles & permissions' },
  { cle: 'foncier', libelle: 'Gabarit Foncier' },
  { cle: 'etudes', libelle: 'Gabarit Études' },
  { cle: 'localites', libelle: 'Localités' },
  { cle: 'contrats', libelle: 'Contrats' },
];

// Hub de configuration société — un onglet par domaine, chacun chargé
// indépendamment (pas de fetch groupé) : les deux n'ont pas le même guard
// côté API (Rôles = societe_admin seul ; Gabarit Foncier = societe_admin OU
// CIO), inutile qu'un onglet bloque l'autre sur un 403.
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
      {onglet === 'localites' && <LocalitesPanel slug={params.slug} />}
      {onglet === 'contrats' && <ParametresContratPanel slug={params.slug} />}
    </>
  );
}
