'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { clearSession } from '@/lib/auth';
import type { Session, Societe } from '@/lib/types';
import { SocieteAvatar } from '@/components/societe-avatar';
import { ClocheNotifications } from '@/components/collab/cloche-notifications';
import { ChatWidget } from '@/components/chat/chat-widget';

type NavItem = {
  cle: string;
  libelle: string;
  icone: LucideIcon;
  // `chemin` relatif à /collab/[slug] ; absent = module pas encore disponible
  // (rendu inerte + tag « bientôt » plutôt qu'un lien mort).
  chemin?: string;
};

// Interface réduite : le collaborateur ne voit que ce qui le concerne. « Mes
// projets » (accès limité à sa cellule) et « Mes indicateurs » arrivent avec
// les gardes serveur des étapes 3 & 4 ; « Mon équipe » (annuaire lecture seule
// + fil de discussion) à l'étape 5.
const NAV: NavItem[] = [
  { cle: 'accueil', libelle: 'Accueil', icone: LayoutDashboard, chemin: '' },
  { cle: 'projets', libelle: 'Mes projets', icone: FolderKanban, chemin: 'projets' },
  { cle: 'indicateurs', libelle: 'Mes indicateurs', icone: Gauge, chemin: 'indicateurs' },
  { cle: 'equipe', libelle: 'Mon équipe', icone: Users },
];

function initiales(utilisateur: Session['utilisateur']): string {
  return `${utilisateur.prenom.charAt(0)}${utilisateur.nom.charAt(0)}`.toUpperCase();
}

type Props = {
  societe: Societe | null;
  session: Session;
  // `cle` de l'entrée de nav active
  active: string;
  titre: string;
  children: React.ReactNode;
};

export function CollaborateurShell({
  societe,
  session,
  active,
  titre,
  children,
}: Props) {
  const router = useRouter();
  const base = `/collab/${session.societe.slug}`;
  const [menuOuvert, setMenuOuvert] = useState(false);

  // Échap ferme le panneau escamotable (tablette / mobile).
  useEffect(() => {
    if (!menuOuvert) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOuvert(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOuvert]);

  function deconnexion() {
    clearSession();
    router.push('/');
  }

  return (
    <div className="admin admin--collab">
      <div
        className={`admin-backdrop${menuOuvert ? ' is-visible' : ''}`}
        onClick={() => setMenuOuvert(false)}
        aria-hidden
      />

      <aside className={`admin-sidebar${menuOuvert ? ' is-open' : ''}`}>
        <div className="admin-brand">
          {societe ? (
            <SocieteAvatar societe={societe} size="md" />
          ) : (
            <span className="admin-brand-fallback">{session.societe.nom.charAt(0)}</span>
          )}
          <span className="admin-brand-text">
            <strong>{session.societe.nom}</strong>
            <span>Espace collaborateur</span>
          </span>
          <button
            type="button"
            className="admin-sidebar-close"
            aria-label="Fermer le menu"
            onClick={() => setMenuOuvert(false)}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <nav className="admin-nav">
          {NAV.map((item) => {
            const Icone = item.icone;
            const estActif = item.cle === active;
            const contenu = (
              <>
                <Icone size={18} strokeWidth={1.75} aria-hidden />
                <span className="admin-nav-label">{item.libelle}</span>
                {item.chemin === undefined && (
                  <span className="admin-nav-tag">bientôt</span>
                )}
              </>
            );

            if (estActif) {
              return (
                <span key={item.cle} className="admin-nav-item is-active" aria-current="page">
                  {contenu}
                </span>
              );
            }
            if (item.chemin === undefined) {
              return (
                <span key={item.cle} className="admin-nav-item is-soon" aria-disabled>
                  {contenu}
                </span>
              );
            }
            return (
              <Link
                key={item.cle}
                href={item.chemin ? `${base}/${item.chemin}` : base}
                className="admin-nav-item"
                onClick={() => setMenuOuvert(false)}
              >
                {contenu}
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <button type="button" className="admin-nav-item admin-nav-btn" onClick={deconnexion}>
            <LogOut size={18} strokeWidth={1.75} aria-hidden />
            <span className="admin-nav-label">Se déconnecter</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="admin-menu-btn"
              aria-label="Ouvrir le menu"
              onClick={() => setMenuOuvert(true)}
            >
              <Menu size={20} strokeWidth={1.75} />
            </button>
            <h1 className="admin-title">{titre}</h1>
          </div>
          <div className="admin-topbar-actions">
            <ChatWidget slug={session.societe.slug} moiId={session.utilisateur.id} />
            <ClocheNotifications slug={session.societe.slug} />
            <span className="admin-user" title={session.utilisateur.email}>
              {initiales(session.utilisateur)}
            </span>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
