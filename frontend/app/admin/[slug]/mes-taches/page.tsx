'use client';

import { Suspense, use } from 'react';
import { MyTasks } from '@/features/my-tasks/my-tasks';

type Props = { params: Promise<{ slug: string }> };

// « Mes tâches » : page d'arrivée du Salarié (revue du 19/10/2026).
export default function MesTachesPage(props: Props) {
  const params = use(props.params);
  return (
    <Suspense>
      <MyTasks slug={params.slug} />
    </Suspense>
  );
}
