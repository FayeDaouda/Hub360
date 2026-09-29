'use client';

import { Suspense } from 'react';
import { useTitrePage } from '@/lib/layout-contexte';
import { MonEspace } from '@/components/mon-espace/mon-espace';

type Props = { params: { slug: string } };

// « Mon espace » (RH lot 5) — même écran pour tous les comptes.
export default function MonEspacePage({ params }: Props) {
  useTitrePage('Mon espace');
  return (
    <Suspense>
      <MonEspace slug={params.slug} />
    </Suspense>
  );
}
