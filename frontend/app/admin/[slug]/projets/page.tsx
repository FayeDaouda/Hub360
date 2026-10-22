'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ADecider } from '@/components/pilotage/a-decider';
import { Delegation } from '@/components/pilotage/delegation';
import { ProjetsOuverts } from '@/components/projets-ouverts/projets-ouverts';
import { Production } from '@/components/projets-ouverts/production';
import { ROLE_CEO, ROLE_CTO, ROLE_DIR_GC } from '@/lib/acces-back-office';
import { useSessionCourante } from '@/lib/layout-contexte';

type Props = { params: { slug: string } };

// Tableau de production (revue Dir. GC, 21/10/2026, lot 6) : Dir. GC, CTO, CEO.
const ROLES_PRODUCTION = new Set([ROLE_DIR_GC, ROLE_CTO, ROLE_CEO, 'societe_admin']);

// Projets par gabarit pour tous les rôles qui ont la section (phase 1,
// 14/10/2026 : l'ancienne vue par phase et la fiche projet à 8 sections sont
// retirées ; une ancienne adresse de fiche redirige ici, `?projet=`). Le Dir.
// GC, le CTO et le CEO ont en plus l'onglet « Production » (`?vue=production`).
export default function ProjetsPage({ params }: Props) {
  const session = useSessionCourante();
  const router = useRouter();
  const chemin = usePathname();
  const production = useSearchParams().get('vue') === 'production';
  if (!ROLES_PRODUCTION.has(session.role)) return <ProjetsOuverts slug={params.slug} />;

  return (
    <>
      <div className="vue-toggle prod-onglets" role="tablist" aria-label="Projets">
        <button type="button" role="tab" aria-selected={!production} className={production ? '' : 'is-active'} onClick={() => router.replace(chemin)}>
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
      {production ? <Production slug={params.slug} /> : <ProjetsOuverts slug={params.slug} />}
    </>
  );
}
