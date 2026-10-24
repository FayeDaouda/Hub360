'use client';

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

// Défilement du back-office (lot S0, 24/10/2026) — une seule règle pour
// toutes les pages, branchée une fois dans la coque (admin-shell.tsx) :
// - hauteur réelle de la barre du haut (--ef-topbar-h), pour ce qui colle
//   dessous et pour le scroll-padding des ancres ; et de la navigation du bas
//   sur téléphone (--ef-nav-h, 0 ailleurs), pour ce qui colle en bas ;
// - `data-defile` sur <html> dès que la page a quitté le haut (voile de la
//   barre) ;
// - listes à en-tête collé (.liste-collee) : hauteur de la barre d'outils
//   (--outils-h) pour coller l'en-tête de colonnes dessous, et
//   `data-entete-colle` seulement si le tableau tient en largeur (sinon il
//   garde son défilement horizontal, en-tête non collé) ;
// - bandeaux (onglets, filtres, étapes, liste des projets) : l'élément actif
//   ramené à l'écran quand il change ;
// - bandeaux et zones qui défilent : `data-bord` (debut / milieu / fin, à
//   l'horizontale) et `data-bord-y` (haut / milieu / bas) pour le fondu des
//   bords qui annonce la suite (01-fondations.css).

const BANDEAUX = '.vue-toggle, .mt-filtres, .po-etapes, .po-liste > ul, .reg-etapes, .eq-raccourcis-liste, .fin-filtres';
const ZONES = '.po-dossier-defile, .eq-cote';
const OUTILS = '.liste-collee-outils';
const TABLEAUX = '.liste-collee .admin-table-wrap, .liste-collee .admin-table';
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

function ajusterEntete(liste: HTMLElement | null) {
  if (!liste) return;
  const cadre = liste.querySelector<HTMLElement>('.admin-table-wrap');
  const tableau = cadre?.querySelector<HTMLElement>('table');
  // En tableau (pas en cartes, téléphone) et sans débordement horizontal.
  const entete = tableau?.querySelector<HTMLElement>('thead th');
  const tient = !!cadre && !!tableau && !!entete?.offsetParent && tableau.offsetWidth <= cadre.clientWidth + 1;
  liste.toggleAttribute('data-entete-colle', tient);
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
  // Barres du haut et du bas : mesurées avant la peinture (pas de saut des
  // éléments collés). La navigation du bas est masquée hors téléphone (0).
  useLayoutEffect(() => {
    const barre = document.querySelector<HTMLElement>('.admin-topbar');
    if (!barre) return;
    const nav = document.querySelector<HTMLElement>('.nav-mobile');
    const racine = document.documentElement;
    const mesurer = () => {
      racine.style.setProperty('--ef-topbar-h', `${barre.offsetHeight}px`);
      racine.style.setProperty('--ef-nav-h', `${nav?.offsetHeight ?? 0}px`);
    };
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(barre);
    if (nav) obs.observe(nav);
    return () => {
      obs.disconnect();
      racine.style.removeProperty('--ef-topbar-h');
      racine.style.removeProperty('--ef-nav-h');
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
    const redim = new ResizeObserver((entrees) =>
      entrees.forEach(({ target }) => {
        const el = target as HTMLElement;
        if (el.matches(OUTILS)) el.closest<HTMLElement>('.liste-collee')?.style.setProperty('--outils-h', `${el.offsetHeight}px`);
        else if (el.matches(TABLEAUX)) ajusterEntete(el.closest<HTMLElement>('.liste-collee'));
        else marquerBord(el);
      }),
    );
    const listes = new Set<HTMLElement>();
    let attente = 0;
    const balayer = () => {
      actifs.forEach((_, bandeau) => {
        if (bandeau.isConnected) return;
        redim.unobserve(bandeau);
        actifs.delete(bandeau);
      });
      listes.forEach((el) => {
        if (el.isConnected) return;
        redim.unobserve(el);
        listes.delete(el);
      });
      document.querySelectorAll<HTMLElement>(`${OUTILS}, ${TABLEAUX}`).forEach((el) => {
        if (listes.has(el)) return;
        listes.add(el);
        redim.observe(el);
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

// Sommaires et raccourcis (Réglages · gabarit, Équipes) : la section en
// lecture est la dernière dont le haut est passé sous le repère — un en-tête
// collé, à défaut la barre du haut — plus la marge d'arrêt des ancres
// (scroll-padding : 1 rem) et un peu de jeu. En bas de page : la dernière.
export function useSectionEnLecture(ids: string[], repere?: RefObject<HTMLElement>): string | undefined {
  const cle = ids.join('|');
  const [enLecture, setEnLecture] = useState<string | undefined>(ids[0]);
  useEffect(() => {
    const liste = cle ? cle.split('|') : [];
    let attente = 0;
    const suivre = () => {
      cancelAnimationFrame(attente);
      attente = requestAnimationFrame(() => {
        const haut = (repere?.current ?? document.querySelector('.admin-topbar'))?.getBoundingClientRect().bottom ?? 0;
        const enBas = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        const passees = liste.filter((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= haut + 24);
        setEnLecture(enBas && window.scrollY > 0 ? liste[liste.length - 1] : (passees.pop() ?? liste[0]));
      });
    };
    suivre();
    window.addEventListener('scroll', suivre, { passive: true });
    window.addEventListener('resize', suivre);
    return () => {
      window.removeEventListener('scroll', suivre);
      window.removeEventListener('resize', suivre);
      cancelAnimationFrame(attente);
    };
  }, [cle, repere]);
  return enLecture;
}

// Aller à une section (sommaire, raccourci) : défilement doux, sauf si la
// personne a demandé moins d'animations.
export function allerA(id: string) {
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' });
}
