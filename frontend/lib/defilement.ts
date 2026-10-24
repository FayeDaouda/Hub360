'use client';

import { useEffect, useLayoutEffect } from 'react';

// Défilement du back-office (lot S0, 24/10/2026) — une seule règle pour
// toutes les pages, branchée une fois dans la coque (admin-shell.tsx) :
// - hauteur réelle de la barre du haut (--ef-topbar-h), pour ce qui colle
//   dessous et pour le scroll-padding des ancres ;
// - `data-defile` sur <html> dès que la page a quitté le haut (voile de la
//   barre) ;
// - bandeaux qui défilent à l'horizontale (onglets, filtres, étapes) :
//   `data-bord` (debut / milieu / fin) pour le fondu des bords qui annonce
//   la suite, et l'élément actif ramené à l'écran quand il change.

const BANDEAUX = '.vue-toggle, .mt-filtres, .po-etapes, .po-liste > ul';
const ACTIF = '.is-active, .is-actif, [aria-selected="true"], [aria-pressed="true"], [aria-checked="true"], [aria-current="page"]';

function marquerBord(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 1) {
    delete el.dataset.bord;
    return;
  }
  el.dataset.bord = el.scrollLeft <= 1 ? 'debut' : el.scrollLeft >= max - 1 ? 'fin' : 'milieu';
}

function ramener(bandeau: HTMLElement, actif: HTMLElement, doux: boolean) {
  if (bandeau.scrollWidth <= bandeau.clientWidth) return;
  const decalage = actif.getBoundingClientRect().left - bandeau.getBoundingClientRect().left;
  const left = bandeau.scrollLeft + decalage - (bandeau.clientWidth - actif.offsetWidth) / 2;
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  bandeau.scrollTo({ left, behavior: doux && !reduit ? 'smooth' : 'auto' });
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
      document.querySelectorAll<HTMLElement>(BANDEAUX).forEach((bandeau) => {
        const nouveau = !actifs.has(bandeau);
        if (nouveau) redim.observe(bandeau);
        const actif = bandeau.querySelector<HTMLElement>(ACTIF);
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
