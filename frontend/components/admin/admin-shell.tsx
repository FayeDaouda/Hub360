'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Bell,
  Contact,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  Settings,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { clearSession } from '@/lib/auth';
import type { Session, Societe } from '@/lib/types';
import { SocieteAvatar } from '@/components/societe-avatar';
import { ChatWidget } from '@/components/chat/chat-widget';

type NavItem = {
  cle: string;
  libelle: string;
  // Nom complet affiché en info-bulle quand le libellé de sidebar est
  // raccourci (ex : les 3 départements de Grey Concrete).
  titreComplet?: string;
  icone: LucideIcon;
  // `chemin` relatif à /admin/[slug] ; absent = module pas encore disponible
  // (rendu inerte plutôt qu'un lien mort).
  chemin?: string;
};

// La navigation suit le flux réel : CRM → Projets, l'équipe à part.
// « Conception » / « Aménagements » ne sont pas des destinations : c'est la
// `categorie` de chaque projet, filtrable dans Projets. Pas de « Documents »
// tant qu'il n'y a pas de modèle derrière (on ne met pas de lien mort).
const NAV: NavItem[] = [
  { cle: 'tableau-de-bord', libelle: 'Tableau de bord', icone: LayoutDashboard, chemin: '' },
  { cle: 'crm', libelle: 'CRM', icone: Contact, chemin: 'crm' },
  { cle: 'projets', libelle: 'Projets', icone: FolderKanban, chemin: 'projets' },
  { cle: 'equipe', libelle: 'Équipe', icone: Users, chemin: 'equipe' },
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

export function AdminShell({ societe, session, active, titre, children }: Props) {
  const router = useRouter();
  const base = `/admin/${session.societe.slug}`;
  // Sidebar en panneau escamotable sous ~960px (tablette portrait, mobile) —
  // voir la mémoire « responsive-all-devices ». Au-dessus de ce seuil, la
  // classe n'a aucun effet (la sidebar reste dans le flux de la grille).
  const [menuOuvert, setMenuOuvert] = useState(false);

  // Échap ferme le panneau — utile au clavier une fois qu'il est ouvert.
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
    <div className="admin">
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
            <span>Back-office</span>
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
                <span
                  key={item.cle}
                  className="admin-nav-item is-active"
                  title={item.titreComplet}
                  aria-current="page"
                >
                  {contenu}
                </span>
              );
            }
            if (item.chemin === undefined) {
              return (
                <span
                  key={item.cle}
                  className="admin-nav-item is-soon"
                  title={item.titreComplet}
                  aria-disabled
                >
                  {contenu}
                </span>
              );
            }
            return (
              <Link
                key={item.cle}
                href={item.chemin ? `${base}/${item.chemin}` : base}
                className="admin-nav-item"
                title={item.titreComplet}
                onClick={() => setMenuOuvert(false)}
              >
                {contenu}
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <span className="admin-nav-item is-soon" aria-disabled>
            <Settings size={18} strokeWidth={1.75} aria-hidden />
            <span className="admin-nav-label">Paramètres</span>
          </span>
          <span className="admin-nav-item is-soon" aria-disabled>
            <LifeBuoy size={18} strokeWidth={1.75} aria-hidden />
            <span className="admin-nav-label">Aide</span>
          </span>
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
            <div className="admin-search">
              <Search size={16} strokeWidth={1.75} aria-hidden />
              <input type="search" placeholder="Rechercher — bientôt" disabled />
            </div>
            <ChatWidget slug={session.societe.slug} moiId={session.utilisateur.id} />
            <button type="button" className="admin-icon-btn" aria-label="Notifications" disabled>
              <Bell size={18} strokeWidth={1.75} aria-hidden />
            </button>
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
