import { BadRequestException } from '@nestjs/common';

// Profil d'un utilisateur (menu du compte, 23/10/2026) — fonctions pures.
//
// Nom affiché : choisi par la personne, montré là où l'on échange
// (salutation, avatar, messagerie, fils, mentions). Le nom officiel
// (prénom + nom, géré par la RH) reste dans les traces de travail
// (assignations, validations, historique, documents).

export function nomPublic(u: { prenom: string; nom: string; nomAffiche?: string | null }): string {
  return u.nomAffiche?.trim() || `${u.prenom} ${u.nom}`.trim();
}

// Chemin de la photo, relatif à l'API (le front y préfixe son adresse).
export const cheminPhoto = (cle: string | null | undefined): string | null => (cle ? `/photos/${cle}` : null);

// Photo d'un membre d'équipe : celle choisie par la personne (son compte),
// sinon celle de la fiche d'équipe posée par l'administration.
export function photoMembre(m: {
  photoCle: string | null;
  utilisateur?: { photoCle: string | null } | null;
  dossierPersonnel?: { utilisateur?: { photoCle: string | null } | null } | null;
}): string | null {
  return cheminPhoto(m.utilisateur?.photoCle ?? m.dossierPersonnel?.utilisateur?.photoCle) ?? m.photoCle;
}

// Champs à lire pour afficher quelqu'un dans un échange.
export const PERSONNE_PUBLIQUE = { id: true, prenom: true, nom: true, nomAffiche: true, photoCle: true } as const;

// Image envoyée par le navigateur : déjà recadrée en carré et allégée
// (≈ 256 px) ; on borne le type et le poids côté serveur.
const TYPES_PHOTO = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const POIDS_MAX_PHOTO = 400_000; // octets

export function lirePhoto(dataUrl: string): { type: string; octets: Buffer } {
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? '');
  if (!m || !TYPES_PHOTO.has(m[1])) throw new BadRequestException('Photo invalide : JPEG, PNG ou WebP attendu.');
  const octets = Buffer.from(m[2], 'base64');
  if (!octets.length) throw new BadRequestException('Photo vide.');
  if (octets.length > POIDS_MAX_PHOTO) throw new BadRequestException('Photo trop lourde (400 Ko au plus).');
  return { type: m[1], octets };
}

// Nom affiché saisi : espaces normalisés ; vide = revenir au nom officiel.
export function normaliserNomAffiche(saisie: string | null | undefined): string | null {
  const s = (saisie ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.length < 2 || s.length > 60) throw new BadRequestException('Nom affiché : entre 2 et 60 caractères.');
  return s;
}
