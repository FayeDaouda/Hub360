'use client';
import { use } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ADecider } from '@/components/pilotage/a-decider';
import { Delegation } from '@/components/pilotage/delegation';
import { OpenProjects } from '@/features/projects/open-projects';
import { Production } from '@/features/projects/production';
import { useSessionCourante } from '@/lib/layout-contexte';
import { ETAPE, ROLE_CTO } from '@hub/domain';
import { niveauSuffisant } from '@/lib/auth';

type Props = { params: Promise<{ slug: string }> };

// Projets par gabarit pour tous les rôles qui ont la section (phase 1,
// 14/10/2026 : l'ancienne vue par phase et la fiche projet à 8 sections sont
// retirées ; une ancienne adresse de fiche redirige ici, `?projet=`). L'onglet
// « Production » (`?vue=production`) suit la Lecture de l'étape « Tableau de
// production » (matrice, 31/10/2026 ; au départ le Dir. GC, le CTO, le CEO).
export default function ProjetsPage(props: Props) {
  const params = use(props.params);
  const session = useSessionCourante();
  const router = useRouter();
  const chemin = usePathname();
  const production = useSearchParams().get('vue') === 'production';
  if (!niveauSuffisant(session, ETAPE.projetsProduction, 'lecture')) return <OpenProjects slug={params.slug} />;

  return (
    <>
      <div className="vue-toggle prod-onglets" role="tablist" aria-label="Projets">
        <button
          type="button"
          role="tab"
          aria-selected={!production}
          className={production ? '' : 'is-active'}
          onClick={() => router.replace(chemin)}
        >
          Projets
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={production}
          className={production ? 'is-active' : ''}
          onClick={() => router.replace(`${chemin}?vue=production`)}
        >
          Production
        </button>
      </div>
      {/* CTO : sa page d'arrivée — ce qui attend sa décision, puis la production. */}
      {production && session.role === ROLE_CTO && <Delegation slug={params.slug} />}
      {production && session.role === ROLE_CTO && <ADecider slug={params.slug} />}
      {production ? <Production slug={params.slug} /> : <OpenProjects slug={params.slug} />}
    </>
  );
}
