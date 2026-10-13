'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { clearSession } from '@/lib/auth';
import type { Session, Societe } from '@/lib/types';
import { SocieteAvatar } from '@/components/societe-avatar';
import { ClocheNotifications } from '@/components/collab/cloche-notifications';
import { ChangerMotDePasseModal } from '@/components/auth/changer-mot-de-passe-modal';
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
  { cle: 'mon-espace', libelle: 'Mon espace', icone: UserRound, chemin: 'mon-espace' },
  { cle: 'equipe', libelle: 'Mon équipe', icone: Users },
];

// Dérive l'entrée de nav active depuis l'URL — même motif que
// activeAdminDepuisPathname (admin-shell.tsx) : un seul point de vérité.
export function activeCollabDepuisPathname(pathname: string, slug: string): string {
  const base = `/collab/${slug}`;
  const reste = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const segment = reste.split('/').filter(Boolean)[0] ?? '';
  return NAV.find((item) => item.chemin === segment)?.cle ?? 'accueil';
}

function initiales(utilisateur: Session['utilisateur']): string {
  return `${utilisateur.prenom.charAt(0)}${utilisateur.nom.charAt(0)}`.toUpperCase();
}

// Repli en rail d'icônes (desktop uniquement — cf. media query 960px) :
// préférence mémorisée, pas remise à zéro à chaque navigation. Même clé que
// AdminShell — un seul réglage de confort par utilisateur, peu importe
// l'espace (admin ou collaborateur).
const CLE_SIDEBAR_REPLIEE = 'hub-sidebar-repliee';

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
  const [mdpOuvert, setMdpOuvert] = useState(false);
  const [repliee, setRepliee] = useState(false);
  // Portail plutôt qu'un ::after dans la sidebar — cf. commentaire équivalent
  // dans AdminShell (overflow-y auto y force overflow-x à `auto`).
  const [infobulle, setInfobulle] = useState<{ texte: string; top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    setRepliee(localStorage.getItem(CLE_SIDEBAR_REPLIEE) === '1');
  }, []);

  function afficherInfobulle(e: { currentTarget: HTMLElement }, texte: string) {
    if (!repliee) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setInfobulle({ texte, top: rect.top + rect.height / 2, left: rect.right + 12 });
  }

  function masquerInfobulle() {
    setInfobulle(null);
  }

  // Échap ferme le panneau escamotable (tablette / mobile).
  useEffect(() => {
    if (!menuOuvert) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOuvert(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOuvert]);

  function basculerRepliee() {
    setRepliee((actuel) => {
      const suivant = !actuel;
      localStorage.setItem(CLE_SIDEBAR_REPLIEE, suivant ? '1' : '0');
      return suivant;
    });
  }

  function deconnexion() {
    clearSession();
    router.push('/');
  }

  return (
    <div className={`admin admin--collab${repliee ? ' admin--repliee' : ''}`}>
      <div
        className={`admin-backdrop${menuOuvert ? ' is-visible' : ''}`}
        onClick={() => setMenuOuvert(false)}
        aria-hidden
      />

      <aside className={`admin-sidebar${menuOuvert ? ' is-open' : ''}`}>
        {/* Pilule de repli — accrochée au bord droit de la sidebar, déborde
            sur le contenu principal (sept. 2026). Sortie du flex/scroll
            interne pour rester ancrée au vrai bord de .admin-sidebar (pas
            celui, décalé par le padding, du contenu défilant) et pour rester
            visible même sidebar repliée. */}
        <button
          type="button"
          className="admin-sidebar-toggle"
          aria-label={repliee ? 'Déplier le menu' : 'Replier le menu'}
          aria-pressed={repliee}
          onClick={basculerRepliee}
        >
          <ChevronLeft
            size={15}
            strokeWidth={2.25}
            className={`admin-sidebar-toggle-icone${repliee ? ' est-tournee' : ''}`}
            aria-hidden
          />
        </button>

        <div className="admin-sidebar-scroll">
          <div className="admin-brand">
            {societe ? (
              <SocieteAvatar societe={societe} size="md" theme="glass" />
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
                <span
                  key={item.cle}
                  className={`admin-nav-item admin-nav-item--${item.cle} is-active`}
                  onMouseEnter={(e) => afficherInfobulle(e, item.libelle)}
                  onMouseLeave={masquerInfobulle}
                  onFocus={(e) => afficherInfobulle(e, item.libelle)}
                  onBlur={masquerInfobulle}
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
                  onMouseEnter={(e) => afficherInfobulle(e, item.libelle)}
                  onMouseLeave={masquerInfobulle}
                  onFocus={(e) => afficherInfobulle(e, item.libelle)}
                  onBlur={masquerInfobulle}
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
                onMouseEnter={(e) => afficherInfobulle(e, item.libelle)}
                onMouseLeave={masquerInfobulle}
                onFocus={(e) => afficherInfobulle(e, item.libelle)}
                onBlur={masquerInfobulle}
                onClick={() => setMenuOuvert(false)}
              >
                {contenu}
              </Link>
            );
          })}
          </nav>

          <div className="admin-sidebar-footer">
            <button
              type="button"
              className="admin-nav-item admin-nav-btn"
              onMouseEnter={(e) => afficherInfobulle(e, 'Se déconnecter')}
              onMouseLeave={masquerInfobulle}
              onFocus={(e) => afficherInfobulle(e, 'Se déconnecter')}
              onBlur={masquerInfobulle}
              onClick={deconnexion}
            >
              <LogOut size={18} strokeWidth={1.75} aria-hidden />
              <span className="admin-nav-label">Se déconnecter</span>
            </button>
          </div>
        </div>
      </aside>

      {infobulle &&
        createPortal(
          <div
            className="sidebar-infobulle"
            style={{ top: infobulle.top, left: infobulle.left }}
          >
            {infobulle.texte}
          </div>,
          document.body,
        )}

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
            <button
              type="button"
              className="admin-user"
              title={`${session.utilisateur.email} · changer mon mot de passe`}
              aria-label="Changer mon mot de passe"
              onClick={() => setMdpOuvert(true)}
            >
              {initiales(session.utilisateur)}
            </button>
            {mdpOuvert && <ChangerMotDePasseModal onClose={() => setMdpOuvert(false)} />}
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
