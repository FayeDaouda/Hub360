'use client';

import { useEffect, useLayoutEffect } from 'react';

// Défilement du back-office (lot S0, 24/10/2026) — une seule règle pour
// toutes les pages, branchée une fois dans la coque (admin-shell.tsx) :
// - hauteur réelle de la barre du haut (--ef-topbar-h), pour ce qui colle
//   dessous et pour le scroll-padding des ancres ;
// - `data-defile` sur <html> dès que la page a quitté le haut (voile de la
//   barre) ;
// - bandeaux (onglets, filtres, étapes, liste des projets) : l'élément actif
//   ramené à l'écran quand il change ;
// - bandeaux et zones qui défilent : `data-bord` (debut / milieu / fin, à
//   l'horizontale) et `data-bord-y` (haut / milieu / bas) pour le fondu des
//   bords qui annonce la suite (01-fondations.css).

const BANDEAUX = '.vue-toggle, .mt-filtres, .po-etapes, .po-liste > ul';
const ZONES = '.po-dossier-defile';
const ACTIF = '.is-active, .is-actif, [aria-selected="true"], [aria-pressed="true"], [aria-checked="true"], [aria-current="page"]';

function bord(position: number, max: number, debut: string, fin: string): string | undefined {
  if (max <= 1) return undefined;
  return position <= 1 ? debut : position >= max - 1 ? fin : 'milieu';
}

function marquerBord(el: HTMLElement) {
  const x = bord(el.scrollLeft, el.scrollWidth - el.clientWidth, 'debut', 'fin');
  const y = bord(el.scrollTop, el.scrollHeight - el.clientHeight, 'haut', 'bas');
  if (x) el.dataset.bord = x;
  else delete el.dataset.bord;
  if (y) el.dataset.bordY = y;
  else delete el.dataset.bordY;
}

function ramener(bandeau: HTMLElement, actif: HTMLElement, doux: boolean) {
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = doux && !reduit ? 'smooth' : 'auto';
  const b = bandeau.getBoundingClientRect();
  const a = actif.getBoundingClientRect();
  // À l'horizontale : centré. À la verticale (liste) : juste rendu visible.
  if (bandeau.scrollWidth > bandeau.clientWidth) {
    bandeau.scrollTo({ left: bandeau.scrollLeft + a.left - b.left - (bandeau.clientWidth - actif.offsetWidth) / 2, behavior });
  } else if (bandeau.scrollHeight > bandeau.clientHeight && (a.top < b.top || a.bottom > b.bottom)) {
    bandeau.scrollTo({ top: bandeau.scrollTop + a.top - b.top - 8, behavior });
  }
}

export function useDefilementCoque() {
  // Barre du haut : mesurée avant la peinture (pas de saut des en-têtes collés).
  useLayoutEffect(() => {
    const barre = document.querySelector<HTMLElement>('.admin-topbar');
    if (!barre) return;
    const racine = document.documentElement;
    const mesurer = () => racine.style.setProperty('--ef-topbar-h', `${barre.offsetHeight}px`);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(barre);
    return () => {
      obs.disconnect();
      racine.style.removeProperty('--ef-topbar-h');
    };
  }, []);

  useEffect(() => {
    const racine = document.documentElement;
    const surPage = () => {
      const defile = window.scrollY > 4;
      if (defile !== (racine.dataset.defile === '1')) {
        if (defile) racine.dataset.defile = '1';
        else delete racine.dataset.defile;
      }
    };
    surPage();
    window.addEventListener('scroll', surPage, { passive: true });

    // Bandeaux : suivis dès qu'ils apparaissent (pages chargées après coup).
    const actifs = new Map<HTMLElement, HTMLElement | null>();
    const redim = new ResizeObserver((entrees) => entrees.forEach((e) => marquerBord(e.target as HTMLElement)));
    let attente = 0;
    const balayer = () => {
      actifs.forEach((_, bandeau) => {
        if (bandeau.isConnected) return;
        redim.unobserve(bandeau);
        actifs.delete(bandeau);
      });
      document.querySelectorAll<HTMLElement>(`${BANDEAUX}, ${ZONES}`).forEach((bandeau) => {
        const nouveau = !actifs.has(bandeau);
        if (nouveau) redim.observe(bandeau);
        const actif = bandeau.matches(BANDEAUX) ? bandeau.querySelector<HTMLElement>(ACTIF) : null;
        if (actif && actif !== actifs.get(bandeau)) ramener(bandeau, actif, !nouveau);
        actifs.set(bandeau, actif);
        marquerBord(bandeau);
      });
    };
    const planifier = () => {
      cancelAnimationFrame(attente);
      attente = requestAnimationFrame(balayer);
    };
    const mutations = new MutationObserver(planifier);
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-selected', 'aria-pressed', 'aria-checked', 'aria-current'],
    });
    const surBandeau = (e: Event) => {
      if (e.target instanceof HTMLElement && actifs.has(e.target)) marquerBord(e.target);
    };
    document.addEventListener('scroll', surBandeau, { capture: true, passive: true });
    balayer();

    return () => {
      window.removeEventListener('scroll', surPage);
      document.removeEventListener('scroll', surBandeau, { capture: true });
      mutations.disconnect();
      redim.disconnect();
      cancelAnimationFrame(attente);
      delete racine.dataset.defile;
    };
  }, []);
}
