'use client';

import { Suspense, use } from 'react';
import { MonEspace } from '@/components/mon-espace/mon-espace';

type Props = { params: Promise<{ slug: string }> };

// « Mon espace » (RH lot 5) — même écran pour tous les comptes ; le titre
// (« Mon espace · Prénom Nom ») est posé par le composant.
export default function MonEspacePage(props: Props) {
  const params = use(props.params);
  return (
    <Suspense>
      <MonEspace slug={params.slug} />
    </Suspense>
  );
}
