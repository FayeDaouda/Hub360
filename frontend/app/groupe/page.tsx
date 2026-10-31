'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, LogOut, Settings } from 'lucide-react';
import { clearSession, getSession, SESSION_EVENT } from '@/lib/auth';
import { estAdministrateurHub, sectionAccessible } from '@/lib/acces-back-office';
import { destinationForSession } from '@/lib/session-redirect';
import { Session } from '@/lib/types';
import { HubLogo } from '@/components/hub-logo';
import { ThemeToggle } from '@/components/admin/theme-toggle';
import { ComptesRolesPanel } from '@/components/groupe/comptes-roles-panel';
import { RolesPanel } from '@/components/admin/roles-panel';
import { JournalAudit } from '@/components/pilotage/journal-audit';
import { DeblocagesPanel } from '@/components/groupe/deblocages-panel';
import { InterrupteursPanel } from '@/components/groupe/interrupteurs-panel';
import { AvisDroitsBandeau } from '@/components/avis-droits-bandeau';
import { libelleRole } from '@/lib/groupe';

type Onglet = 'comptes' | 'droits' | 'journal' | 'deblocages' | 'interrupteurs';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'comptes', libelle: 'Comptes & rôles' },
  { cle: 'droits', libelle: 'Droits des rôles' },
  { cle: 'journal', libelle: 'Journal d’audit' },
  { cle: 'deblocages', libelle: 'Déblocages' },
  { cle: 'interrupteurs', libelle: 'Interrupteurs' },
];

// Administration du HUB — le CIO et l'Administrateur HUB, tous deux à carte
// blanche (31/10/2026, cf. estAdministrateurHub). Les autres rôles sont
// renvoyés vers leur propre destination (voir destinationForSession).
// Console : comptes & rôles, droits des rôles (matrice), journal d'audit,
// déblocages et interrupteurs de la société de connexion.
export default function GroupePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('comptes');

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
    // Droits relus après un avis : la console suit sans rechargement.
    const suivre = () => setSession(getSession());
    window.addEventListener(SESSION_EVENT, suivre);
    return () => window.removeEventListener(SESSION_EVENT, suivre);
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
          {sectionAccessible(session, 'parametres') && (
            <Link href={`/admin/${session.societe.slug}/reglages`} className="btn-ghost">
              <Settings size={15} aria-hidden />
              <span className="groupe-libelle-bouton">Réglages du HUB</span>
            </Link>
          )}
          <Link href={`/admin/${session.societe.slug}`} className="btn-ghost">
            <LayoutDashboard size={15} aria-hidden />
            <span className="groupe-libelle-bouton">Back-office {session.societe.nom}</span>
          </Link>
          <ThemeToggle />
          <button type="button" className="btn-ghost" onClick={handleLogout}>
            <LogOut size={15} aria-hidden />
            <span className="groupe-libelle-bouton">Se déconnecter</span>
          </button>
        </div>
      </header>

      <main className="groupe-contenu">
        <AvisDroitsBandeau />
        <div className="groupe-intro">
          <h1>Bonjour {session.utilisateur.prenom}</h1>
          <p>
            {session.adminHub
              ? `Administrateur HUB · en tant que ${libelleRole(session.role)} · ${session.societe.nom}. Comptes de toutes les sociétés ; droits et journal de ${session.societe.nom}.`
              : `Administration du HUB · carte blanche. Comptes de toutes les sociétés ; droits, journal, déblocages et interrupteurs de ${session.societe.nom}.`}
          </p>
        </div>
        <div className="admin-periode groupe-console-onglets">
          <div className="admin-periode-toggle" role="group" aria-label="Section de l’administration">
            {ONGLETS.map((o) => (
              <button
                key={o.cle}
                type="button"
                className={o.cle === onglet ? 'is-active' : ''}
                aria-pressed={o.cle === onglet}
                onClick={() => setOnglet(o.cle)}
              >
                {o.libelle}
              </button>
            ))}
          </div>
        </div>
        {onglet === 'comptes' && <ComptesRolesPanel moiId={session.utilisateur.id} />}
        {onglet === 'droits' && <RolesPanel slug={session.societe.slug} />}
        {onglet === 'journal' && <JournalAudit slug={session.societe.slug} />}
        {onglet === 'deblocages' && <DeblocagesPanel slug={session.societe.slug} />}
        {onglet === 'interrupteurs' && <InterrupteursPanel slug={session.societe.slug} />}
      </main>
    </div>
  );
}
