'use client';

import { useEffect, useState } from 'react';
import { apiSociete } from './client-api';
import { niveauSuffisant } from './auth';
import type { Session } from './types';
import { ETAPE, ROLE_CFO, ROLE_CIO, ROLE_CTO } from '@hub/domain';

// Contresignature au-delà du seuil (décision du 12/10/2026, étape de la
// matrice depuis le 31/10/2026 ; au départ le CEO) : son titulaire voit toutes
// les Finances mais ne valide (envoi d'une offre, émission, avoir,
// encaissements) que les affaires au-delà du seuil (Réglages, TTC) — même
// règle que backend/src/finances/seuil-ceo.service.ts, qui revérifie. En deçà,
// la validation revient aux autres : l'écran ne la lui propose pas.

export const getSeuilContresignature = (slug: string) =>
  apiSociete<{ seuilTtc: number }>(slug, '/finances/seuil-contresignature');

// Carte blanche (Administrateur HUB, CIO) : aucune limite de seuil.
const carteBlanche = (s: Session) => !!s.adminHub || s.role === ROLE_CIO;

export const estContresignataire = (s: Session) =>
  !carteBlanche(s) && niveauSuffisant(s, ETAPE.financesContresignature, 'validation');

// Seuil chargé pour le titulaire de la contresignature seulement (null sinon,
// ou tant qu'il charge).
export function useSeuilCeo(slug: string, session: Session): number | null {
  const [seuil, setSeuil] = useState<number | null>(null);
  const contresignataire = estContresignataire(session);
  useEffect(() => {
    if (!contresignataire) return;
    getSeuilContresignature(slug)
      .then((r) => setSeuil(r.seuilTtc))
      .catch(() => setSeuil(null));
  }, [slug, contresignataire]);
  return seuil;
}

// La validation d'une affaire de `montantTtc` est-elle offerte à cette session ?
// (le droit « validation » de la matrice est vérifié à part). Titulaire de la
// contresignature : seulement au-delà du seuil — rien tant qu'il n'est pas connu.
export function valideAffaire(session: Session, seuil: number | null, montantTtc: number): boolean {
  if (!estContresignataire(session)) return true;
  return seuil !== null && montantTtc > seuil;
}

// Contresignature exclusive (revue CEO, 22/10/2026) : au-delà du seuil,
// envoyer une offre ou un devis et émettre une facture reviennent au titulaire
// de la contresignature seul — ou au délégataire du CEO en fonction. Même
// règle que le serveur (seuil-ceo.service.ts, « exclusif »). Les
// encaissements et les avoirs suivent valideAffaire.
export type Contresignature = { seuil: number | null; delegue: boolean };

const valideFinances = (s: Session) =>
  niveauSuffisant(s, ETAPE.financesOffres, 'validation') || niveauSuffisant(s, ETAPE.financesFactures, 'validation');

export function useContresignature(slug: string, session: Session): Contresignature {
  const [etat, setEtat] = useState<Contresignature>({ seuil: null, delegue: false });
  const concerne = !carteBlanche(session) && (estContresignataire(session) || valideFinances(session));
  const delegable = session.role === ROLE_CFO || session.role === ROLE_CTO;
  useEffect(() => {
    if (!concerne) return;
    getSeuilContresignature(slug)
      .then((r) => setEtat((e) => ({ ...e, seuil: r.seuilTtc })))
      .catch(() => undefined);
    if (delegable) {
      apiSociete<{ delegations: { enCours: boolean }[] }>(slug, '/pilotage/delegation')
        .then((v) => setEtat((e) => ({ ...e, delegue: v.delegations.some((d) => d.enCours) })))
        .catch(() => undefined);
    }
  }, [slug, concerne, delegable]);
  return etat;
}

export function contresigneAffaire(session: Session, c: Contresignature, montantTtc: number): boolean {
  if (carteBlanche(session)) return true;
  if (estContresignataire(session)) return c.seuil !== null && montantTtc > c.seuil;
  if (valideFinances(session)) return c.seuil !== null && (montantTtc <= c.seuil || c.delegue);
  return true;
}
