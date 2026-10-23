import { apiAuth, urlApi } from './client-api';
import type { Session } from './types';

// Profil de la personne connectée (menu du compte, 23/10/2026).
//
// Nom affiché : choisi par la personne, montré là où l'on échange
// (salutation, avatar, messagerie, fils, mentions) ; le nom officiel (RH)
// reste dans les traces de travail.

export type Profil = {
  nomOfficiel: string;
  nomAffiche: string | null;
  photoUrl: string | null; // « /photos/<clé> » (API)
  derniereConnexionLe: string | null;
  connexionPrecedenteLe: string | null;
  absence: { jusquau: string; type: 'conge_paye' | 'maladie' | 'permission_exceptionnelle' | 'autre' } | null;
};

export const getProfil = () => apiAuth<Profil>('/auth/moi');
export const majNomAffiche = (nomAffiche: string | null) => apiAuth<Profil>('/auth/moi', { method: 'PATCH', body: { nomAffiche } });
export const majPhoto = (image: string) => apiAuth<Profil>('/auth/moi/photo', { method: 'PUT', body: { image } });
export const retirerPhoto = () => apiAuth<Profil>('/auth/moi/photo', { method: 'DELETE' });
export const deconnecterPartout = () => apiAuth<{ ok: true }>('/auth/moi/deconnexion-partout', { method: 'POST', body: {} });

// Source d'une photo : chemin de l'API (photo du compte) ou data URI (photo
// de fiche d'équipe posée par l'administration).
export function srcPhoto(photo: string | null | undefined): string | null {
  if (!photo) return null;
  return photo.startsWith('/photos/') ? urlApi(photo) : photo;
}

// Nom à montrer pour la personne connectée, et son prénom d'usage.
export function nomAffiche(u: Session['utilisateur']): string {
  return u.nomAffiche?.trim() || `${u.prenom} ${u.nom}`.trim();
}
export function prenomAffiche(u: Session['utilisateur']): string {
  return u.nomAffiche?.trim().split(/\s+/)[0] || u.prenom;
}

// Initiales (deux au plus) d'un nom affiché.
export function initialesDe(nom: string): string {
  return (
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((m) => m.charAt(0))
      .join('')
      .toUpperCase() || '?'
  );
}

// Couleur propre à chaque personne (initiales sans photo) : stable, tirée
// d'une clé (id ou nom). Teintes d'identité, claires pour le texte blanc.
const TEINTES = [262, 292, 322, 200, 172, 228, 18, 140];
export function couleurPersonne(cle: string): string {
  let h = 0;
  for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) >>> 0;
  return `oklch(52% 0.14 ${TEINTES[h % TEINTES.length]})`;
}

// Photo choisie : recadrée en carré au centre, réduite à 256 px, en WebP
// (JPEG si le navigateur ne sait pas) — quelques dizaines de Ko.
export async function preparerPhoto(fichier: File, cote = 256): Promise<string> {
  if (!fichier.type.startsWith('image/')) throw new Error('Choisissez une image (JPEG, PNG, WebP, HEIC converti…).');
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error('Image illisible.'));
      i.src = url;
    });
    const c = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = cote;
    canvas.height = cote;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image illisible.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - c) / 2, (img.naturalHeight - c) / 2, c, c, 0, 0, cote, cote);
    const webp = canvas.toDataURL('image/webp', 0.86);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}
