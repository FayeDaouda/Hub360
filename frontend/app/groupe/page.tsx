'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, LogOut } from 'lucide-react';
import { clearSession, getSession } from '@/lib/auth';
import { estAdministrateurHub } from '@/lib/acces-back-office';
import { destinationForSession } from '@/lib/session-redirect';
import { Session } from '@/lib/types';
import { HubLogo } from '@/components/hub-logo';
import { ThemeToggle } from '@/components/admin/theme-toggle';
import { ComptesRolesPanel } from '@/components/groupe/comptes-roles-panel';
import { ROLE_CIO } from '@hub/domain';

// Administration du HUB — le CIO, super admin désigné (28/09/2026), ou le
// compte technique holding_admin (cf. estAdministrateurHub). Les autres rôles
// sont renvoyés vers leur propre destination (voir destinationForSession).
// Premier outil : Comptes & rôles (rôles de la matrice + salaires).
export default function GroupePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace('/');
      return;
    }
    if (!estAdministrateurHub(current)) {
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
          <span className="groupe-barre-titre">Administration du HUB</span>
        </div>
        <div className="groupe-barre-actions">
          {/* Le CIO a aussi un rôle métier dans sa société (ex. CRM) — le
              compte technique holding_admin, lui, n'a pas de back-office. */}
          {session.role === ROLE_CIO && (
            <Link href={`/admin/${session.societe.slug}`} className="btn-ghost">
              <LayoutDashboard size={15} aria-hidden />
              <span className="groupe-libelle-bouton">Back-office {session.societe.nom}</span>
            </Link>
          )}
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
          <p>Administration du HUB — rôles et rémunérations des comptes de chaque société.</p>
        </div>
        <ComptesRolesPanel moiId={session.utilisateur.id} />
      </main>
    </div>
  );
}
