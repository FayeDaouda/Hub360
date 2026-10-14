'use client';

import { ProjetsOuverts } from '@/components/projets-ouverts/projets-ouverts';

type Props = { params: { slug: string } };

// Projets par gabarit pour tous les rôles qui ont la section (phase 1,
// 14/10/2026 : l'ancienne vue par phase et la fiche projet à 8 sections sont
// retirées ; une ancienne adresse de fiche redirige ici, `?projet=`).
export default function ProjetsPage({ params }: Props) {
  return <ProjetsOuverts slug={params.slug} />;
}
