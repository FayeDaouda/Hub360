'use client';

import { createContext, useContext, useEffect } from 'react';
import type { Session, Societe } from './types';

// Contexte posé par les layouts persistants (app/admin/[slug]/layout.tsx,
// app/collab/[slug]/layout.tsx) — la coquille (sidebar/topbar) ne démonte plus
// entre deux pages (cf. cadrage « layout persistant », sept. 2026 : l'ancien
// système où chaque page refaisait sa propre auth + son propre AdminShell
// provoquait un re-montage complet à chaque navigation, visible sous forme de
// clignotement). Les pages consomment la session déjà chargée par le layout
// et peuvent personnaliser le titre affiché dans la topbar.
type LayoutCtx = {
  session: Session;
  // Nullable : chargée en second (après la session), comme avant le layout
  // persistant — les pages qui en ont besoin (ex. l'en-tête de marque d'un
  // document imprimable) doivent déjà gérer son absence transitoire.
  societe: Societe | null;
  definirTitre: (titre: string) => void;
};

const Ctx = createContext<LayoutCtx | null>(null);

export const LayoutProvider = Ctx.Provider;

function useLayoutCtx(): LayoutCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useTitrePage / useSessionCourante doivent être utilisés sous un layout admin ou collab.');
  }
  return ctx;
}

// Personnalise le titre de la topbar pour la page courante — sans appel,
// le layout garde le titre de la page précédente jusqu'à ce que celle-ci
// pose le sien (aucun flash de titre vide : la coquille ne démonte plus).
export function useTitrePage(titre: string) {
  const { definirTitre } = useLayoutCtx();
  useEffect(() => {
    definirTitre(titre);
  }, [titre, definirTitre]);
}

// Session déjà chargée + validée par le layout — jamais null ici (le layout
// ne rend `children` qu'une fois la session prête).
export function useSessionCourante(): Session {
  return useLayoutCtx().session;
}

// Société déjà chargée par le layout — peut être `null` brièvement (chargée
// après la session) ; les rares pages qui en ont besoin directement (ex. le
// document imprimable, qui porte le logo/la couleur de marque) gèrent déjà ce
// cas comme avant le layout persistant.
export function useSocieteCourante(): Societe | null {
  return useLayoutCtx().societe;
}
