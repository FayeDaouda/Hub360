'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getSociete } from '@/lib/api';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import { LayoutProvider } from '@/lib/layout-contexte';
import type { Session, Societe } from '@/lib/types';
import {
  CollaborateurShell,
  activeCollabDepuisPathname,
} from '@/components/collab/collab-shell';

type Props = {
  children: React.ReactNode;
  params: { slug: string };
};

// Layout persistant — même motif que app/admin/[slug]/layout.tsx (cf. cadrage
// « layout persistant », sept. 2026) : session + société chargées une fois
// par visite, sidebar/topbar jamais démontées entre deux pages.
export default function CollabLayout({ children, params }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [titre, setTitre] = useState('');

  useEffect(() => {
    const current = getSession();
    if (!current || current.societe.slug !== params.slug) {
      router.replace(`/login/${params.slug}`);
      return;
    }
    if (current.role !== 'collaborateur') {
      router.replace(destinationForSession(current));
      return;
    }
    setSession(current);
    getSociete(params.slug)
      .then(setSociete)
      .catch(() => setSociete(null));
  }, [params.slug, router]);

  if (!session) return null;

  return (
    <LayoutProvider value={{ session, societe, definirTitre: setTitre }}>
      <CollaborateurShell
        societe={societe}
        session={session}
        active={activeCollabDepuisPathname(pathname, params.slug)}
        titre={titre}
      >
        {children}
      </CollaborateurShell>
    </LayoutProvider>
  );
}
