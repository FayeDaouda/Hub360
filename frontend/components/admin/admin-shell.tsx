'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  Contact,
  FolderKanban,
  IdCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { clearSession } from '@/lib/auth';
import { estAdministrateurHub, sectionAccessible } from '@/lib/acces-back-office';
import type { Session, Societe } from '@/lib/types';
import { SocieteAvatar } from '@/components/societe-avatar';
import { ChatWidget } from '@/components/chat/chat-widget';
import { ClocheNotifications } from '@/components/admin/cloche-notifications';
import { ThemeToggle } from '@/components/admin/theme-toggle';

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
  // Étiquette de sidebar (ex. « restreint » : module réservé à la direction).
  tag?: string;
};

// La navigation suit le flux réel : CRM → Projets, l'équipe à part.
// « Conception » / « Aménagements » ne sont pas des destinations : c'est la
// `categorie` de chaque projet, filtrable dans Projets. Pas de « Documents »
// tant qu'il n'y a pas de modèle derrière (on ne met pas de lien mort).
const NAV: NavItem[] = [
  { cle: 'tableau-de-bord', libelle: 'Pilotage', icone: LayoutDashboard, chemin: '' },
  { cle: 'crm', libelle: 'CRM', icone: Contact, chemin: 'crm' },
  { cle: 'projets', libelle: 'Projets', icone: FolderKanban, chemin: 'projets' },
  { cle: 'facturation', libelle: 'Finances', icone: ReceiptText, chemin: 'facturation', tag: 'restreint' },
  { cle: 'rh', libelle: 'RH', icone: IdCard, chemin: 'rh' },
  { cle: 'equipe', libelle: 'Équipes', icone: Users, chemin: 'equipe' },
  { cle: 'mon-espace', libelle: 'Mon espace', icone: UserRound, chemin: 'mon-espace' },
];

// Dérive l'entrée de nav active depuis l'URL — un seul point de vérité (avant
// sept. 2026, chaque page passait son propre `active="..."` en dur, un risque
// d'oubli/désynchro à chaque nouvelle page). Le premier segment après
// /admin/:slug suffit : toutes les sous-pages d'un module (ex.
// /projets/:id/permis) retombent sur le même `cle` que leur module racine.
export function activeAdminDepuisPathname(pathname: string, slug: string): string {
  const base = `/admin/${slug}`;
  const reste = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const segment = reste.split('/').filter(Boolean)[0] ?? '';
  // « Paramètres » vit dans le pied de sidebar, pas dans NAV (colonne
  // principale) — reste géré ici pour garder un seul point de vérité.
  if (segment === 'reglages' || segment === 'parametres') return 'parametres';
  return NAV.find((item) => item.chemin === segment)?.cle ?? 'tableau-de-bord';
}

function initiales(utilisateur: Session['utilisateur']): string {
  return `${utilisateur.prenom.charAt(0)}${utilisateur.nom.charAt(0)}`.toUpperCase();
}

// Repli en rail d'icônes (desktop uniquement — cf. media query 960px) :
// préférence mémorisée, pas remise à zéro à chaque navigation.
const CLE_SIDEBAR_REPLIEE = 'hub-sidebar-repliee';

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
  // Lu après le premier rendu (localStorage indisponible côté serveur) —
  // évite un flash pour la majorité des utilisateurs (repli non activé par
  // défaut), au prix d'un très bref sursaut pour ceux qui l'ont activé.
  const [repliee, setRepliee] = useState(false);
  // Étiquette flottante d'un item de nav en rail replié — en portail plutôt
  // qu'un ::after positionné dans la sidebar : .admin-sidebar a un
  // overflow-y auto, qui force overflow-x à `auto` lui aussi (règle CSS
  // overflow) et aurait rogné toute étiquette débordant du rail de 76px.
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

  // Échap ferme le panneau — utile au clavier une fois qu'il est ouvert.
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
    <div className={`admin${repliee ? ' admin--repliee' : ''}`}>
      {/* Halos flous en fond — sans eux le verre dépoli des cartes n'a rien
          d'intéressant à révéler (retour boss, sept. 2026, sur la 1ère passe
          dark/light). Fixes (ne défilent pas), sous tout le reste. */}
      <div className="admin-atmosphere" aria-hidden>
        <span className="admin-atmosphere-blob admin-atmosphere-blob--violet" />
        <span className="admin-atmosphere-blob admin-atmosphere-blob--orange" />
        <span className="admin-atmosphere-blob admin-atmosphere-blob--cyan" />
      </div>

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
          {NAV.filter((item) => sectionAccessible(session, item.cle)).map((item) => {
            const Icone = item.icone;
            const estActif = item.cle === active;
            const contenu = (
              <>
                <Icone size={18} strokeWidth={1.75} aria-hidden />
                <span className="admin-nav-label">{item.libelle}</span>
                {item.chemin === undefined ? (
                  <span className="admin-nav-tag">bientôt</span>
                ) : (
                  item.tag && <span className="admin-nav-tag admin-nav-tag--statut">{item.tag}</span>
                )}
              </>
            );

            if (estActif) {
              return (
                <span
                  key={item.cle}
                  className={`admin-nav-item admin-nav-item--${item.cle} is-active`}
                  title={repliee ? undefined : item.titreComplet}
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
                  title={repliee ? undefined : item.titreComplet}
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
                title={repliee ? undefined : item.titreComplet}
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
            {/* CIO (super admin du HUB) : retour à l'administration du HUB. */}
            {estAdministrateurHub(session) && (
              <Link
                href="/groupe"
                className="admin-nav-item"
                onMouseEnter={(e) => afficherInfobulle(e, 'Administration du HUB')}
                onMouseLeave={masquerInfobulle}
                onFocus={(e) => afficherInfobulle(e, 'Administration du HUB')}
                onBlur={masquerInfobulle}
                onClick={() => setMenuOuvert(false)}
              >
                <ShieldCheck size={18} strokeWidth={1.75} aria-hidden />
                <span className="admin-nav-label">Administration du HUB</span>
              </Link>
            )}
            {sectionAccessible(session, 'parametres') && (
              <Link
                href={`${base}/reglages`}
                className={`admin-nav-item admin-nav-item--parametres${
                  active === 'parametres' ? ' is-active' : ''
                }`}
                onMouseEnter={(e) => afficherInfobulle(e, 'Réglages')}
                onMouseLeave={masquerInfobulle}
                onFocus={(e) => afficherInfobulle(e, 'Réglages')}
                onBlur={masquerInfobulle}
                onClick={() => setMenuOuvert(false)}
                aria-current={active === 'parametres' ? 'page' : undefined}
              >
                <Settings size={18} strokeWidth={1.75} aria-hidden />
                <span className="admin-nav-label">Réglages</span>
              </Link>
            )}
            <span
              className="admin-nav-item is-soon"
              onMouseEnter={(e) => afficherInfobulle(e, 'Aide')}
              onMouseLeave={masquerInfobulle}
              onFocus={(e) => afficherInfobulle(e, 'Aide')}
              onBlur={masquerInfobulle}
              aria-disabled
            >
              <LifeBuoy size={18} strokeWidth={1.75} aria-hidden />
              <span className="admin-nav-label">Aide</span>
            </span>
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
            <div className="admin-search">
              <Search size={16} strokeWidth={1.75} aria-hidden />
              <input type="search" placeholder="Rechercher — bientôt" disabled />
            </div>
            <ChatWidget slug={session.societe.slug} moiId={session.utilisateur.id} />
            <ClocheNotifications slug={session.societe.slug} session={session} />
            <ThemeToggle />
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
