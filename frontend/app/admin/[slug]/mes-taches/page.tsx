'use client';

import { Suspense } from 'react';
import { MesTaches } from '@/components/mes-taches/mes-taches';

type Props = { params: { slug: string } };

// « Mes tâches » : page d'arrivée du Salarié (revue du 19/10/2026).
export default function MesTachesPage({ params }: Props) {
  return (
    <Suspense>
      <MesTaches slug={params.slug} />
    </Suspense>
  );
}
