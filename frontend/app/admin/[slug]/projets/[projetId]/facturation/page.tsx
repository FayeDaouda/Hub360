import { redirect } from 'next/navigation';
import { lienFacturationProjet } from '@/lib/facturation';

// Ancienne adresse (avant la phase 1) : la facturation d'un projet vit dans
// Finances. Redirection côté serveur, avant tout rendu.
export default function Page({ params }: { params: { slug: string; projetId: string } }) {
  redirect(lienFacturationProjet(params.slug, params.projetId));
}
