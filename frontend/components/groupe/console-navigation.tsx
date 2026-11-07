'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Building2, Menu, Settings, type LucideIcon } from 'lucide-react';
import type { Session } from '@/lib/types';
import { sectionAccessible } from '@/lib/acces-back-office';
import { CloseButton, Dialog } from '@/components/ui/dialog';
import { GROUPES_CONSOLE, lienSection, type SectionConsole } from '@/components/groupe/console-sections';

// Navigation de l'Administration du HUB : menu latéral sur ordinateur et
// tablette, panneau qui monte du bas sur téléphone (même feuille que le
// « Plus » du back-office). Les sections sont des liens : l'adresse porte la
// section ouverte.

type Sorties = { href: string; libelle: string; icone: LucideIcon }[];

function sortiesConsole(session: Session): Sorties {
  const base = `/admin/${session.societe.slug}`;
  return [
    ...(sectionAccessible(session, 'parametres')
      ? [{ href: `${base}/reglages`, libelle: 'Réglages du HUB', icone: Settings }]
      : []),
    { href: base, libelle: `Back-office ${session.societe.nom}`, icone: Building2 },
  ];
}

export function NavigationConsole({ session, active }: { session: Session; active: SectionConsole }) {
  return (
    <nav className="groupe-nav" aria-label="Sections de l’administration">
      {GROUPES_CONSOLE.map((g) => (
        <div key={g.libelle}>
          <span className="groupe-nav-titre" aria-hidden>
            {g.libelle}
          </span>
          <ul aria-label={g.libelle}>
            {g.sections.map((s) => (
              <li key={s.cle}>
                <Link
                  href={lienSection(s.cle)}
                  className={`groupe-nav-lien${s.cle === active ? ' is-active' : ''}`}
                  aria-current={s.cle === active ? 'page' : undefined}
                  scroll={false}
                >
                  <s.icone size={17} aria-hidden />
                  <span>{s.libelle}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ul className="groupe-nav-sorties" aria-label="Autres espaces">
        {sortiesConsole(session).map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="groupe-nav-lien">
              <s.icone size={17} aria-hidden />
              <span>{s.libelle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function NavigationConsoleMobile({ session, active }: { session: Session; active: SectionConsole }) {
  const [ouvert, setOuvert] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const feuille = useRef<HTMLDivElement>(null);
  const fermer = () => {
    setOuvert(false);
    bouton.current?.focus();
  };

  // À l'ouverture, le focus va sur la section en cours (sinon la première).
  useEffect(() => {
    if (!ouvert) return;
    const cible =
      feuille.current?.querySelector<HTMLElement>('[aria-current="page"]') ??
      feuille.current?.querySelector<HTMLElement>('a');
    cible?.focus();
  }, [ouvert]);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className="groupe-nav-bouton"
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-label="Sections de l’administration"
        onClick={() => setOuvert(true)}
      >
        <Menu size={20} aria-hidden />
      </button>
      {ouvert && (
        <Dialog
          onClose={fermer}
          portal
          backdropClassName="feuille-fond"
          className="feuille groupe-feuille"
          label="Sections de l’administration"
          boxRef={feuille}
        >
          <span className="feuille-poignee" aria-hidden />
          <div className="feuille-tete">
            <strong>Administration du HUB</strong>
            <CloseButton onClick={fermer} />
          </div>
          {GROUPES_CONSOLE.map((g) => (
            <div key={g.libelle} className="groupe-feuille-groupe">
              <span className="feuille-libelle">{g.libelle}</span>
              <div className="feuille-groupe">
                {g.sections.map((s) => (
                  <Link
                    key={s.cle}
                    href={lienSection(s.cle)}
                    className={`feuille-ligne${s.cle === active ? ' is-active' : ''}`}
                    aria-current={s.cle === active ? 'page' : undefined}
                    scroll={false}
                    onClick={fermer}
                  >
                    <s.icone size={19} aria-hidden />
                    <span>{s.libelle}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <div className="feuille-groupe">
            {sortiesConsole(session).map((s) => (
              <Link key={s.href} href={s.href} className="feuille-ligne" onClick={fermer}>
                <s.icone size={19} aria-hidden />
                <span>{s.libelle}</span>
              </Link>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}
