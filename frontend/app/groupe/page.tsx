'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { clearSession, getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import { Session } from '@/lib/types';
import { HubLogo } from '@/components/hub-logo';
import { ThemeToggle } from '@/components/admin/theme-toggle';
import { ComptesRolesPanel } from '@/components/groupe/comptes-roles-panel';

// Espace groupe — réservé à holding_admin (le « super admin », rôle
// transverse, pas lié à une société précise). Les autres rôles sont renvoyés
// vers leur propre destination (voir destinationForSession). Premier outil :
// Comptes & rôles (attribution des rôles de la matrice + salaires).
export default function GroupePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace('/');
      return;
    }
    if (current.role !== 'holding_admin') {
      router.replace(destinationForSession(current));
      return;
    }
    setSession(current);
  }, [router]);

  if (!session) return null;

  function handleLogout() {
    clearSession();
    router.push('/');
  }

  return (
    <div className="groupe-espace">
      <div className="admin-atmosphere" aria-hidden>
        <span className="admin-atmosphere-blob admin-atmosphere-blob--violet" />
        <span className="admin-atmosphere-blob admin-atmosphere-blob--orange" />
        <span className="admin-atmosphere-blob admin-atmosphere-blob--cyan" />
      </div>

      <header className="groupe-barre">
        <div className="groupe-barre-marque">
          <HubLogo className="groupe-logo" />
          <span className="groupe-barre-titre">Espace groupe</span>
        </div>
        <div className="groupe-barre-actions">
          <ThemeToggle />
          <button type="button" className="btn-ghost" onClick={handleLogout}>
            <LogOut size={15} aria-hidden />
            <span className="groupe-libelle-bouton">Se déconnecter</span>
          </button>
        </div>
      </header>

      <main className="groupe-contenu">
        <div className="groupe-intro">
          <h1>Bonjour {session.utilisateur.prenom}</h1>
          <p>Administration du groupe — rôles et rémunérations des comptes de chaque société.</p>
        </div>
        <ComptesRolesPanel />
      </main>
    </div>
  );
}
