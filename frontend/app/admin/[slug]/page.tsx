'use client';
import { use } from "react";

import { Pilotage } from '@/components/pilotage/pilotage';
import { useTitrePage } from '@/lib/layout-contexte';

type Props = { params: Promise<{ slug: string }> };

// Pilotage · tableau de bord Holding (maquettes du boss) pour tous, compte de
// secours compris (phase 1, 14/10/2026 : l'ancien tableau de bord de
// l'administration est retiré). Accès gérés par app/admin/[slug]/layout.tsx.
export default function AdminPage(props: Props) {
  const params = use(props.params);
  useTitrePage('Pilotage · tableau de bord Holding');
  return <Pilotage slug={params.slug} />;
}
