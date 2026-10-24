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
  ListChecks,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { clearSession, niveauSuffisant } from '@/lib/auth';
import { estAdministrateurHub, sectionAccessible, sectionArrivee } from '@/lib/acces-back-office';
import type { Session, Societe } from '@/lib/types';
import { SocieteAvatar } from '@/components/societe-avatar';
import { MenuCompte } from '@/components/admin/menu-compte';
import { ChatWidget } from '@/components/chat/chat-widget';
import { ClocheNotifications } from '@/components/admin/cloche-notifications';
import { RechercheGlobale } from '@/components/admin/recherche-globale';
import { AideGlobale, ouvrirAide } from '@/components/admin/aide-globale';
import { ThemeToggle } from '@/components/admin/theme-toggle';
import { NavigationMobile } from '@/components/admin/navigation-mobile';
import { useDefilementCoque } from '@/lib/defilement';

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
  { cle: 'mes-taches', libelle: 'Mes tâches', icone: ListChecks, chemin: 'mes-taches' },
  { cle: 'tableau-de-bord', libelle: 'Pilotage', icone: LayoutDashboard, chemin: '' },
  { cle: 'crm', libelle: 'CRM', icone: Contact, chemin: 'crm' },
  { cle: 'projets', libelle: 'Projets', icone: FolderKanban, chemin: 'projets' },
  { cle: 'facturation', libelle: 'Finances', icone: ReceiptText, chemin: 'facturation' },
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
  if (segment === 'mes-reglages') return 'mes-reglages';
  return NAV.find((item) => item.chemin === segment)?.cle ?? 'tableau-de-bord';
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
  // Barre du haut collée, voile au défilement, bandeaux horizontaux
  // (fondu des bords, onglet actif ramené à l'écran) : lib/defilement.ts.
  useDefilementCoque();
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
      {/* Premier arrêt de tabulation : passer la navigation d'un coup. */}
      <a className="lien-evitement" href="#contenu">
        Aller au contenu
      </a>
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
              <X size={18} />
            </button>
          </div>

          <nav className="admin-nav">
          {NAV.filter((item) => sectionAccessible(session, item.cle)).map((item) => {
            const Icone = item.icone;
            const estActif = item.cle === active;
            const contenu = (
              <>
                <Icone size={18} aria-hidden />
                <span className="admin-nav-label">{item.libelle}</span>
                {item.chemin === undefined ? (
                  <span className="admin-nav-tag">bientôt</span>
                ) : (
                  item.tag && <span className="admin-nav-tag admin-nav-tag--statut">{item.tag}</span>
                )}
              </>
            );

            if (estActif) {
              // Vrai lien (atteignable au clavier, annoncé « page courante ») :
              // depuis une sous-page, il ramène à l'accueil de la section.
              return (
                <Link
                  key={item.cle}
                  href={item.chemin ? `${base}/${item.chemin}` : base}
                  className={`admin-nav-item admin-nav-item--${item.cle} is-active`}
                  title={repliee ? undefined : item.titreComplet}
                  onMouseEnter={(e) => afficherInfobulle(e, item.libelle)}
                  onMouseLeave={masquerInfobulle}
                  onFocus={(e) => afficherInfobulle(e, item.libelle)}
                  onBlur={masquerInfobulle}
                  onClick={() => setMenuOuvert(false)}
                  aria-current="page"
                >
                  {contenu}
                </Link>
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
                <ShieldCheck size={18} aria-hidden />
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
                <Settings size={18} aria-hidden />
                <span className="admin-nav-label">Réglages</span>
              </Link>
            )}
            {/* Réglages personnels (compte, sécurité, apparence) : tous les
                rôles ; le CIO a les Réglages du HUB ci-dessus. */}
            {!sectionAccessible(session, 'parametres') && (
              <Link
                href={`${base}/mes-reglages`}
                className={`admin-nav-item admin-nav-item--parametres${active === 'mes-reglages' ? ' is-active' : ''}`}
                onMouseEnter={(e) => afficherInfobulle(e, 'Réglages')}
                onMouseLeave={masquerInfobulle}
                onFocus={(e) => afficherInfobulle(e, 'Réglages')}
                onBlur={masquerInfobulle}
                onClick={() => setMenuOuvert(false)}
                aria-current={active === 'mes-reglages' ? 'page' : undefined}
              >
                <Settings size={18} aria-hidden />
                <span className="admin-nav-label">Réglages</span>
              </Link>
            )}
            <button
              type="button"
              className="admin-nav-item admin-nav-btn admin-nav-btn--neutre"
              onMouseEnter={(e) => afficherInfobulle(e, 'Aide')}
              onMouseLeave={masquerInfobulle}
              onFocus={(e) => afficherInfobulle(e, 'Aide')}
              onBlur={masquerInfobulle}
              onClick={() => {
                setMenuOuvert(false);
                ouvrirAide();
              }}
            >
              <LifeBuoy size={18} aria-hidden />
              <span className="admin-nav-label">Aide</span>
            </button>
            <button
              type="button"
              className="admin-nav-item admin-nav-btn"
              onMouseEnter={(e) => afficherInfobulle(e, 'Se déconnecter')}
              onMouseLeave={masquerInfobulle}
              onFocus={(e) => afficherInfobulle(e, 'Se déconnecter')}
              onBlur={masquerInfobulle}
              onClick={deconnexion}
            >
              <LogOut size={18} aria-hidden />
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

      <main id="contenu" className="admin-main" tabIndex={-1}>
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            {/* Téléphone : la marque de la société à la place du menu (navigation en bas). */}
            <span className="admin-topbar-marque" aria-hidden>
              {societe ? (
                <SocieteAvatar societe={societe} size="md" theme="glass" />
              ) : (
                <span className="admin-brand-fallback">{session.societe.nom.charAt(0)}</span>
              )}
            </span>
            <button
              type="button"
              className="admin-menu-btn"
              aria-label="Ouvrir le menu"
              onClick={() => setMenuOuvert(true)}
            >
              <Menu size={20} />
            </button>
            {/* Titre vide : la page porte son propre h1 (ex. salut de Mes tâches). */}
            {titre && <h1 className="admin-title">{titre}</h1>}
          </div>
          <div className="admin-topbar-actions">
            <RechercheGlobale slug={session.societe.slug} />
            {/* Module « communication » de la matrice : aucun = pas de chat,
                lecture = lecture seule (le serveur applique la même règle). */}
            {niveauSuffisant(session, 'communication', 'lecture') && (
              <ChatWidget
                slug={session.societe.slug}
                moiId={session.utilisateur.id}
                ecriture={niveauSuffisant(session, 'communication', 'ecriture')}
              />
            )}
            <ClocheNotifications slug={session.societe.slug} session={session} />
            {/* Aide et thème : dans « Plus » sur téléphone (barre du haut sur une ligne). */}
            <span className="masque-mobile">
              <AideGlobale session={session} />
            </span>
            <span className="masque-mobile">
              <ThemeToggle />
            </span>
            {/* Menu du compte : identité, sécurité, accès personnels, apparence, aide, déconnexion. */}
            <MenuCompte session={session} base={base} onDeconnexion={deconnexion} />
          </div>
        </header>

        {/* Téléphone : grand titre sous la barre (masqué sur ordinateur, où le titre est dans la barre). */}
        {titre && (
          <h1 className="admin-grand-titre" aria-hidden>
            {titre}
          </h1>
        )}
        {children}
      </main>

      <NavigationMobile
        items={NAV.filter((item) => item.chemin !== undefined && sectionAccessible(session, item.cle))
          // La page d'arrivée du rôle (RH, Finances du CFO) en premier onglet.
          .sort((x, y) => Number(y.cle === sectionArrivee(session)) - Number(x.cle === sectionArrivee(session)))
          .map((item) => ({
            cle: item.cle,
            libelle: item.libelle,
            icone: item.icone,
            href: item.chemin ? `${base}/${item.chemin}` : base,
          }))}
        active={active}
        reglages={
          sectionAccessible(session, 'parametres')
            ? { cle: 'parametres', libelle: 'Réglages du HUB', icone: Settings, href: `${base}/reglages` }
            : { cle: 'mes-reglages', libelle: 'Réglages', icone: Settings, href: `${base}/mes-reglages` }
        }
        administration={estAdministrateurHub(session) ? { cle: 'groupe', libelle: 'Administration du HUB', icone: ShieldCheck, href: '/groupe' } : null}
        onDeconnexion={deconnexion}
      />
    </div>
  );
}
