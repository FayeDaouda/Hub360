import { PersonAvatar } from '@/components/ui/avatar';

// Photo (celle choisie par la personne, sinon celle de la fiche d'équipe),
// sinon les initiales sur la couleur de la personne (Mon espace, Ma cellule).
export function Avatar({ nom, photo, taille = 'md' }: { nom: string; photo: string | null; taille?: 'sm' | 'md' }) {
  return <PersonAvatar name={nom} photo={photo} size={taille === 'md' ? 'lg' : 'sm'} />;
}
