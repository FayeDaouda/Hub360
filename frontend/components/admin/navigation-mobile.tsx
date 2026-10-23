'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { HelpCircle, LogOut, Menu, MessageSquareWarning, X, type LucideIcon } from 'lucide-react';
import { usePreferenceTheme } from '@/lib/theme';
import { ouvrirAide } from '@/components/admin/aide-globale';
import { OPTIONS_THEME } from '@/components/selecteur-theme';

export type ItemNav = { cle: string; libelle: string; icone: LucideIcon; href: string };

// Navigation du téléphone (≤ 720 px, revue mobile 20/10/2026) : barre
// d'onglets en bas, à portée de pouce, comme une application native — les
// sections du rôle, et « Plus » (sections restantes, réglages, aide, thème,
// déconnexion) dans un panneau qui monte du bas. Remplace le menu latéral.
export function NavigationMobile({
  items,
  active,
  reglages,
  administration,
  onDeconnexion,
}: {
  items: ItemNav[];
  active: string;
  reglages: ItemNav;
  administration: ItemNav | null;
  onDeconnexion: () => void;
}) {
  const [plus, setPlus] = useState(false);
  // 4 onglets au plus avant « Plus » ; les suivants passent dans le panneau.
  const visibles = items.length > 4 ? items.slice(0, 3) : items;
  const autres = items.length > 4 ? items.slice(3) : [];
  const plusActif = autres.some((i) => i.cle === active) || active === reglages.cle;

  return (
    <>
      <nav className="nav-mobile" aria-label="Navigation principale">
        {visibles.map((i) => (
          <Link key={i.cle} href={i.href} className={`nav-mobile-item${i.cle === active ? ' is-active' : ''}`} aria-current={i.cle === active ? 'page' : undefined}>
            <i.icone size={21} strokeWidth={i.cle === active ? 2.2 : 1.5} aria-hidden />
            <span>{i.libelle}</span>
          </Link>
        ))}
        <button type="button" className={`nav-mobile-item${plusActif ? ' is-active' : ''}`} aria-haspopup="dialog" onClick={() => setPlus(true)}>
          <Menu size={21} strokeWidth={plusActif ? 2.2 : 1.5} aria-hidden />
          <span>Plus</span>
        </button>
      </nav>
      {plus && (
        <PanneauPlus
          autres={autres}
          active={active}
          reglages={reglages}
          administration={administration}
          onDeconnexion={onDeconnexion}
          onClose={() => setPlus(false)}
        />
      )}
    </>
  );
}

function PanneauPlus({
  autres,
  active,
  reglages,
  administration,
  onDeconnexion,
  onClose,
}: {
  autres: ItemNav[];
  active: string;
  reglages: ItemNav;
  administration: ItemNav | null;
  onDeconnexion: () => void;
  onClose: () => void;
}) {
  const { preference, choisir } = usePreferenceTheme();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lien = (i: ItemNav) => (
    <Link key={i.cle} href={i.href} className={`feuille-ligne${i.cle === active ? ' is-active' : ''}`} onClick={onClose}>
      <i.icone size={19} aria-hidden />
      <span>{i.libelle}</span>
    </Link>
  );
  const aide = (onglet: 'guide' | 'signaler') => {
    onClose();
    ouvrirAide(onglet);
  };

  return createPortal(
    <div className="feuille-fond" onClick={onClose}>
      <div className="feuille" role="dialog" aria-modal="true" aria-label="Plus" onClick={(e) => e.stopPropagation()}>
        <span className="feuille-poignee" aria-hidden />
        <div className="feuille-tete">
          <strong>Plus</strong>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {autres.length > 0 && <div className="feuille-groupe">{autres.map(lien)}</div>}
        <div className="feuille-groupe">
          {administration && lien(administration)}
          {lien(reglages)}
          <button type="button" className="feuille-ligne" onClick={() => aide('guide')}>
            <HelpCircle size={19} aria-hidden />
            <span>Aide</span>
          </button>
          <button type="button" className="feuille-ligne" onClick={() => aide('signaler')}>
            <MessageSquareWarning size={19} aria-hidden />
            <span>Signaler un problème</span>
          </button>
        </div>
        <div className="feuille-groupe feuille-theme">
          <span className="feuille-libelle">Apparence</span>
          <div className="vue-toggle" role="radiogroup" aria-label="Thème">
            {OPTIONS_THEME.map(({ valeur, libelle, Icone }) => (
              <button
                key={valeur}
                type="button"
                role="radio"
                aria-checked={preference === valeur}
                className={`rg-theme${preference === valeur ? ' is-active' : ''}`}
                onClick={() => choisir(valeur)}
              >
                <Icone size={14} aria-hidden /> {libelle}
              </button>
            ))}
          </div>
        </div>
        <div className="feuille-groupe">
          <button type="button" className="feuille-ligne feuille-ligne--alerte" onClick={onDeconnexion}>
            <LogOut size={19} aria-hidden />
            <span>Se déconnecter</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

