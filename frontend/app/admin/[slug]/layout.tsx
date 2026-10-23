'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getSociete } from '@/lib/api';
import { clearSession, getSession, remplacerSession } from '@/lib/auth';
import {
  premiereSectionAccessible,
  sectionAccessible,
} from '@/lib/acces-back-office';
import { destinationForSession } from '@/lib/session-redirect';
import { LayoutProvider } from '@/lib/layout-contexte';
import type { Session, Societe } from '@/lib/types';
import { AdminShell, activeAdminDepuisPathname } from '@/components/admin/admin-shell';

type Props = {
  children: React.ReactNode;
  params: { slug: string };
};

// Layout persistant (cf. cadrage « layout persistant », sept. 2026) : session
// + société chargées UNE FOIS par visite, sidebar/topbar jamais démontées
// entre deux pages — avant ce layout, chaque page refaisait sa propre auth et
// son propre <AdminShell>, provoquant un remontage complet à chaque clic
// (visible sous forme de clignotement, coûteux en re-fetch société).
export default function AdminLayout({ children, params }: Props) {
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
    // Session ouverte avant l'arrivée des permissions dans la session : le
    // serveur la refuserait sur les sections gouvernées par la matrice (JWT
    // sans permissions) — reconnexion plutôt qu'un écran d'erreurs.
    if (!current.permissions) {
      clearSession();
      router.replace(`/login/${params.slug}`);
      return;
    }
    if (premiereSectionAccessible(current) === null) {
      router.replace(destinationForSession(current));
      return;
    }
    setSession(current);
    getSociete(params.slug)
      .then(setSociete)
      .catch(() => setSociete(null));
  }, [params.slug, router]);

  // Section de l'URL non ouverte à ce rôle (lien direct, favori) → sa
  // première section accessible, plutôt qu'une page dont l'API refuserait
  // tous les appels.
  const active = activeAdminDepuisPathname(pathname, params.slug);
  const sectionRefusee =
    !!session && !sectionAccessible(session, active);
  useEffect(() => {
    if (session && sectionRefusee) {
      const section = premiereSectionAccessible(session) ?? '';
      router.replace(section ? `/admin/${params.slug}/${section}` : `/admin/${params.slug}`);
    }
  }, [session, sectionRefusee, params.slug, router]);

  if (!session || sectionRefusee) return null;

  return (
    <LayoutProvider
      value={{
        session,
        societe,
        definirTitre: setTitre,
        majSession: (s) => {
          remplacerSession(s);
          setSession(s);
        },
      }}
    >
      <AdminShell
        societe={societe}
        session={session}
        active={active}
        titre={titre}
      >
        {children}
      </AdminShell>
    </LayoutProvider>
  );
}
