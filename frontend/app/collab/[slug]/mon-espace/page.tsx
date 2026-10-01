'use client';

import { Suspense } from 'react';
import { MonEspace } from '@/components/mon-espace/mon-espace';

type Props = { params: { slug: string } };

// « Mon espace » (RH lot 5) — même écran pour tous les comptes ; le titre
// (« Mon espace · Prénom Nom ») est posé par le composant.
export default function MonEspacePage({ params }: Props) {
  return (
    <Suspense>
      <MonEspace slug={params.slug} />
    </Suspense>
  );
}
