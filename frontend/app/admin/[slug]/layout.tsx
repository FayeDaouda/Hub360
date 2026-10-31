'use client';

import { useEffect, useState, use } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getSociete } from '@/lib/api';
import { clearSession, getSession, remplacerSession, SESSION_EVENT } from '@/lib/auth';
import { premiereSectionAccessible, sectionAccessible } from '@/lib/acces-back-office';
import { destinationForSession } from '@/lib/session-redirect';
import { LayoutProvider } from '@/lib/layout-contexte';
import type { Session, Societe } from '@/lib/types';
import { AdminShell, activeAdminDepuisPathname } from '@/components/admin/admin-shell';

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

// Layout persistant (cf. cadrage « layout persistant », sept. 2026) : session
// + société chargées UNE FOIS par visite, sidebar/topbar jamais démontées
// entre deux pages — avant ce layout, chaque page refaisait sa propre auth et
// son propre <AdminShell>, provoquant un remontage complet à chaque clic
// (visible sous forme de clignotement, coûteux en re-fetch société).
export default function AdminLayout({ children, ...props }: Props) {
  const params = use(props.params);
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

  // Session enregistrée ailleurs (droits relus après un avis, prolongation) :
  // la coquille et les pages suivent sans rechargement. Une section dont le
  // droit vient d'être retiré renvoie à la première section encore ouverte.
  useEffect(() => {
    const suivre = () => {
      const s = getSession();
      if (s && s.societe.slug === params.slug) setSession(s);
    };
    window.addEventListener(SESSION_EVENT, suivre);
    return () => window.removeEventListener(SESSION_EVENT, suivre);
  }, [params.slug]);

  // Section de l'URL non ouverte à ce rôle (lien direct, favori) → sa
  // première section accessible, plutôt qu'une page dont l'API refuserait
  // tous les appels.
  const active = activeAdminDepuisPathname(pathname, params.slug);
  const sectionRefusee = !!session && !sectionAccessible(session, active);
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
        // remplacerSession émet SESSION_EVENT : la coquille suit d'elle-même.
        majSession: remplacerSession,
      }}
    >
      <AdminShell societe={societe} session={session} active={active} titre={titre}>
        {children}
      </AdminShell>
    </LayoutProvider>
  );
}
