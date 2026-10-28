'use client';

import { useEffect, useState } from 'react';
import { apiSociete } from './client-api';
import type { Session } from './types';
import { ROLE_CEO, ROLE_CFO } from '@hub/domain';

// Validation financière du CEO (décision du 12/10/2026) : il voit toutes les
// Finances mais ne valide (envoi d'une offre, émission, avoir, encaissements)
// que les affaires au-delà du seuil de contresignature (Réglages, TTC) — même
// règle que backend/src/finances/seuil-ceo.service.ts, qui revérifie. En deçà,
// la validation revient au CFO : l'écran ne la propose pas au CEO.

export const getSeuilContresignature = (slug: string) =>
  apiSociete<{ seuilTtc: number }>(slug, '/finances/seuil-contresignature');

// Seuil chargé pour le CEO seulement (null sinon, ou tant qu'il charge).
export function useSeuilCeo(slug: string, session: Session): number | null {
  const [seuil, setSeuil] = useState<number | null>(null);
  const ceo = session.role === ROLE_CEO;
  useEffect(() => {
    if (!ceo) return;
    getSeuilContresignature(slug)
      .then((r) => setSeuil(r.seuilTtc))
      .catch(() => setSeuil(null));
  }, [slug, ceo]);
  return seuil;
}

// La validation d'une affaire de `montantTtc` est-elle offerte à cette session ?
// (le droit « validation » de la matrice est vérifié à part). CEO : seulement
// au-delà du seuil — rien tant que le seuil n'est pas connu.
export function valideAffaire(session: Session, seuil: number | null, montantTtc: number): boolean {
  if (session.role !== ROLE_CEO) return true;
  return seuil !== null && montantTtc > seuil;
}

// Contresignature exclusive (revue CEO, 22/10/2026) : au-delà du seuil,
// envoyer une offre ou un devis et émettre une facture reviennent au CEO
// seul — ou au CFO délégataire en fonction. Même règle que le serveur
// (seuil-ceo.service.ts, « exclusif »). Les encaissements et les avoirs
// suivent valideAffaire.
export type Contresignature = { seuil: number | null; delegue: boolean };

export function useContresignature(slug: string, session: Session): Contresignature {
  const [etat, setEtat] = useState<Contresignature>({ seuil: null, delegue: false });
  const concerne = session.role === ROLE_CEO || session.role === ROLE_CFO;
  useEffect(() => {
    if (!concerne) return;
    getSeuilContresignature(slug)
      .then((r) => setEtat((e) => ({ ...e, seuil: r.seuilTtc })))
      .catch(() => undefined);
    if (session.role === ROLE_CFO) {
      apiSociete<{ delegations: { enCours: boolean }[] }>(slug, '/pilotage/delegation')
        .then((v) => setEtat((e) => ({ ...e, delegue: v.delegations.some((d) => d.enCours) })))
        .catch(() => undefined);
    }
  }, [slug, concerne, session.role]);
  return etat;
}

export function contresigneAffaire(session: Session, c: Contresignature, montantTtc: number): boolean {
  if (session.role === ROLE_CEO) return c.seuil !== null && montantTtc > c.seuil;
  if (session.role === ROLE_CFO) return c.seuil !== null && (montantTtc <= c.seuil || c.delegue);
  return true;
}
