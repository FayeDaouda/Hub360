'use client';

import { use } from 'react';
import { useTitrePage } from '@/lib/layout-contexte';
import { RecrutementVue } from '@/components/recrutement/recrutement-vue';

type Props = { params: Promise<{ slug: string }> };

// Recrutement (lot 13, 01/11/2026) : la vue vit dans components/recrutement,
// partagée avec l'onglet « Recrutement » de la page RH.
export default function RecrutementPage(props: Props) {
  const { slug } = use(props.params);
  useTitrePage('Recrutement');
  return <RecrutementVue slug={slug} />;
}
