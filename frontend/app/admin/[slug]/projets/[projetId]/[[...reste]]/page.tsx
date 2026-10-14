import { redirect } from 'next/navigation';

// Ancienne fiche projet et ses sections (retirées en phase 1, 14/10/2026) :
// le projet s'ouvre dans Projets par gabarit. La facturation a sa propre
// redirection (../facturation) vers Finances.
export default function Page({ params }: { params: { slug: string; projetId: string } }) {
  redirect(`/admin/${params.slug}/projets?projet=${params.projetId}`);
}
