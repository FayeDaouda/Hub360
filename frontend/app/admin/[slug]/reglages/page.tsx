'use client';

import { Suspense, use } from 'react';
import { useTitrePage } from '@/lib/layout-contexte';
import { Reglages } from '@/components/reglages/reglages';

type Props = { params: Promise<{ slug: string }> };

// Réglages · HUB 360° — CIO et admin de la société (SocieteAdminOuCioGuard).
export default function ReglagesPage(props: Props) {
  const params = use(props.params);
  useTitrePage('Réglages · HUB 360°');
  return (
    <Suspense>
      <Reglages slug={params.slug} />
    </Suspense>
  );
}
