'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, LogOut, Settings } from 'lucide-react';
import { clearSession, getSession } from '@/lib/auth';
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
import { libelleRole } from '@/lib/groupe';
import { ROLE_CIO } from '@hub/domain';

type Onglet = 'comptes' | 'droits' | 'journal' | 'deblocages' | 'interrupteurs';

// Déblocages et interrupteurs : Administrateur HUB seulement.
const ONGLETS: { cle: Onglet; libelle: string; adminHub?: true }[] = [
  { cle: 'comptes', libelle: 'Comptes & rôles' },
  { cle: 'droits', libelle: 'Droits des rôles' },
  { cle: 'journal', libelle: 'Journal d’audit' },
  { cle: 'deblocages', libelle: 'Déblocages', adminHub: true },
  { cle: 'interrupteurs', libelle: 'Interrupteurs', adminHub: true },
];

// Administration du HUB — l'Administrateur HUB (carte blanche, 29/10/2026),
// le CIO, super admin désigné (28/09/2026), ou le compte technique
// holding_admin (cf. estAdministrateurHub). Les autres rôles sont renvoyés
// vers leur propre destination (voir destinationForSession). Console :
// comptes & rôles, droits des rôles (matrice) et journal d'audit de la
// société de connexion ; les droits et le journal ne s'ouvrent pas à
// holding_admin, qui n'a pas de société.
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
  }, [router]);

  if (!session) return null;
  const gouverne = !!session.adminHub || session.role === ROLE_CIO;

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
          {gouverne && sectionAccessible(session, 'parametres') && (
            <Link href={`/admin/${session.societe.slug}/reglages`} className="btn-ghost">
              <Settings size={15} aria-hidden />
              <span className="groupe-libelle-bouton">Réglages du HUB</span>
            </Link>
          )}
          {gouverne && (
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
          <p>
            {session.adminHub
              ? `Administrateur HUB · en tant que ${libelleRole(session.role)} · ${session.societe.nom}. Comptes de toutes les sociétés ; droits et journal de ${session.societe.nom}.`
              : 'Administration du HUB — rôles et rémunérations des comptes de chaque société.'}
          </p>
        </div>
        {gouverne && (
          <div className="admin-periode groupe-console-onglets">
            <div className="admin-periode-toggle" role="group" aria-label="Section de l’administration">
              {ONGLETS.filter((o) => !o.adminHub || session.adminHub).map((o) => (
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
        )}
        {onglet === 'comptes' && <ComptesRolesPanel moiId={session.utilisateur.id} />}
        {gouverne && onglet === 'droits' && <RolesPanel slug={session.societe.slug} />}
        {gouverne && onglet === 'journal' && <JournalAudit slug={session.societe.slug} />}
        {session.adminHub && onglet === 'deblocages' && <DeblocagesPanel slug={session.societe.slug} />}
        {session.adminHub && onglet === 'interrupteurs' && <InterrupteursPanel slug={session.societe.slug} />}
      </main>
    </div>
  );
}
