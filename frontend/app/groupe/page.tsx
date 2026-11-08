'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { clearSession, getSession, SESSION_EVENT } from '@/lib/auth';
import { estAdministrateurHub } from '@/lib/acces-back-office';
import { destinationForSession } from '@/lib/session-redirect';
import { Session } from '@/lib/types';
import { HubLogo } from '@/components/hub-logo';
import { ThemeToggle } from '@/components/admin/theme-toggle';
import { MenuCompte } from '@/components/admin/menu-compte';
import { AideGlobale } from '@/components/admin/aide-globale';
import { ComptesRolesPanel } from '@/components/groupe/comptes-roles-panel';
import { RolesPanel } from '@/components/admin/roles-panel';
import { JournalAudit } from '@/components/pilotage/journal-audit';
import { DeblocagesPanel } from '@/components/groupe/deblocages-panel';
import { ModulesPanel } from '@/components/groupe/modules-panel';
import { NavigationConsole, NavigationConsoleMobile } from '@/components/groupe/console-navigation';
import { definitionSection, sectionDepuisParametre } from '@/components/groupe/console-sections';
import { AvisDroitsBandeau } from '@/components/avis-droits-bandeau';
import { Pill } from '@/components/ui/pill';
import { libelleRole } from '@/lib/groupe';
import { confirmLeave, leaveTo } from '@/components/unsaved-changes-guard';

// Administration du HUB — le CIO et l'Administrateur HUB, tous deux à carte
// blanche (31/10/2026, cf. estAdministrateurHub). Les autres rôles sont
// renvoyés vers leur propre destination (voir destinationForSession).
// Console (refonte du 07/11/2026) : menu latéral en trois groupes, section
// ouverte portée par l'adresse (?onglet=), en-tête commun à chaque section.
export default function GroupePage() {
  // useSearchParams : page prérendue, la lecture de l'adresse attend le client.
  return (
    <Suspense fallback={null}>
      <ConsoleAdministration />
    </Suspense>
  );
}

function ConsoleAdministration() {
  const router = useRouter();
  const section = sectionDepuisParametre(useSearchParams().get('onglet'));
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
    // Droits relus après un avis : la console suit sans rechargement, ou
    // renvoie ailleurs si la personne n'administre plus le HUB.
    const suivre = () => {
      const relue = getSession();
      if (!relue) router.replace('/');
      else if (!estAdministrateurHub(relue)) router.replace(destinationForSession(relue));
      else setSession(relue);
    };
    window.addEventListener(SESSION_EVENT, suivre);
    return () => window.removeEventListener(SESSION_EVENT, suivre);
  }, [router]);

  // Changement de section (menu collant) : retour en haut et focus sur le
  // contenu, pour que le titre soit visible et que le lecteur d'écran suive.
  const sectionPrecedente = useRef(section);
  useEffect(() => {
    if (sectionPrecedente.current === section) return;
    sectionPrecedente.current = section;
    window.scrollTo({ top: 0 });
    document.getElementById('console-contenu')?.focus({ preventScroll: true });
  }, [section]);

  // Titre de l'onglet du navigateur : une adresse par section, un titre par section.
  useEffect(() => {
    document.title = `${definitionSection(section).libelle} · Administration du HUB`;
  }, [section]);

  if (!session) return null;

  // Changements non enregistrés (droits) : la fenêtre de garde demande d'abord.
  async function deconnexion() {
    if (!(await confirmLeave())) return;
    clearSession();
    leaveTo(router, '/');
  }

  const slug = session.societe.slug;
  const definition = definitionSection(section);

  return (
    <div className="groupe-espace">
      <div className="admin-atmosphere" aria-hidden>
        <span className="admin-atmosphere-blob admin-atmosphere-blob--violet" />
        <span className="admin-atmosphere-blob admin-atmosphere-blob--orange" />
        <span className="admin-atmosphere-blob admin-atmosphere-blob--cyan" />
      </div>
      <a className="lien-evitement" href="#console-contenu">
        Aller au contenu
      </a>

      <header className="groupe-barre">
        <div className="groupe-barre-marque">
          <NavigationConsoleMobile session={session} active={section} />
          <HubLogo className="groupe-logo" />
          <span className="groupe-barre-titre">Administration du HUB</span>
          <Pill tone="azur" className="groupe-barre-mandat">
            {session.adminHub ? `Administrateur HUB · en tant que ${libelleRole(session.role)}` : 'Carte blanche'}
          </Pill>
        </div>
        <div className="groupe-barre-actions">
          <span className="groupe-societe">
            <Building2 size={14} aria-hidden />
            {session.societe.nom}
          </span>
          {/* Monté aussi sur téléphone (bouton masqué) : le menu du compte
              ouvre l'aide et « Signaler un problème » par lui. */}
          <span className="masque-mobile">
            <AideGlobale session={session} />
          </span>
          <span className="masque-mobile">
            <ThemeToggle />
          </span>
          <MenuCompte session={session} base={`/admin/${slug}`} onDeconnexion={deconnexion} />
        </div>
      </header>

      <div className="groupe-cadre">
        <NavigationConsole session={session} active={section} />

        <main id="console-contenu" className="groupe-contenu" tabIndex={-1}>
          <AvisDroitsBandeau />
          <header className="groupe-section-entete">
            <span className="groupe-section-groupe">
              {definition.groupe}
              {/* Périmètre de la section, visible aussi sur téléphone. */}
              {definition.portee === 'societe' && ` · ${session.societe.nom}`}
            </span>
            <h1>{definition.libelle}</h1>
            <p>{definition.description(session.societe.nom)}</p>
          </header>
          {section === 'comptes' && <ComptesRolesPanel moiId={session.utilisateur.id} />}
          {section === 'droits' && <RolesPanel key={slug} slug={slug} />}
          {section === 'modules' && <ModulesPanel slug={slug} societe={session.societe.nom} />}
          {section === 'journal' && <JournalAudit slug={slug} entete={false} />}
          {section === 'deblocages' && <DeblocagesPanel slug={slug} />}
        </main>
      </div>
    </div>
  );
}
