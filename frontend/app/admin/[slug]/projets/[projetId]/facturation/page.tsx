import { redirect } from 'next/navigation';
import { lienFacturationProjet } from '@/lib/facturation';

// Ancienne adresse (avant la phase 1) : la facturation d'un projet vit dans
// Finances. Redirection côté serveur, avant tout rendu.
export default async function Page(props: { params: Promise<{ slug: string; projetId: string }> }) {
  const params = await props.params;
  redirect(lienFacturationProjet(params.slug, params.projetId));
}
