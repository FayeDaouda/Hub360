'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import { Session } from '@/lib/types';

type Props = {
  params: Promise<{ slug: string }>;
};

// Écran générique « connecté » — filet de sécurité pour un rôle qui n'a pas
// (encore) de surface dédiée. holding_admin → /groupe, societe_admin →
// /admin/[slug] : chacun est renvoyé chez lui.
export default function EspacePage(props: Props) {
  const params = use(props.params);
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const current = getSession();
    if (!current || current.societe.slug !== params.slug) {
      router.replace(`/login/${params.slug}`);
      return;
    }
    const dest = destinationForSession(current);
    if (dest !== `/espace/${params.slug}`) {
      router.replace(dest);
      return;
    }
    setSession(current);
  }, [params.slug, router]);

  if (!session) return null;

  function handleLogout() {
    clearSession();
    router.push('/');
  }

  return (
    <main>
      <header className="espace-header">
        <span>{session!.societe.nom}</span>
        <button className="btn-ghost" onClick={handleLogout}>
          Se déconnecter
        </button>
      </header>
      <div className="espace-welcome">
        <h1>Bienvenue, {session!.utilisateur.prenom}</h1>
        <p>
          Connecté en tant que <strong>{session!.role}</strong> sur {session!.societe.nom}.
        </p>
        <p className="espace-note">
          Les modules (Projets, Finances, Documents, Communication) arrivent dans une prochaine étape.
        </p>
      </div>
    </main>
  );
}
