import { AvatarPersonne } from '@/components/avatar-personne';

// Photo (celle choisie par la personne, sinon celle de la fiche d'équipe),
// sinon les initiales sur la couleur de la personne (Mon espace, Ma cellule).
export function Avatar({ nom, photo, taille = 'md' }: { nom: string; photo: string | null; taille?: 'sm' | 'md' }) {
  return <AvatarPersonne nom={nom} photo={photo} taille={taille === 'md' ? 'lg' : 'sm'} />;
}
