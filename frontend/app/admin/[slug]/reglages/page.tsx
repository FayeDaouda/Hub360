'use client';

import { Suspense } from 'react';
import { useTitrePage } from '@/lib/layout-contexte';
import { Reglages } from '@/components/reglages/reglages';

type Props = { params: { slug: string } };

// Réglages · HUB 360° — CIO et admin de la société (SocieteAdminOuCioGuard).
export default function ReglagesPage({ params }: Props) {
  useTitrePage('Réglages · HUB 360°');
  return (
    <Suspense>
      <Reglages slug={params.slug} />
    </Suspense>
  );
}
