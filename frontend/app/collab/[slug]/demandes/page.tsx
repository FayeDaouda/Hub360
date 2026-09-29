import { redirect } from 'next/navigation';

// Ancienne adresse : la rubrique vit désormais dans « Mon espace » (RH lot 5).
export default function Page({ params }: { params: { slug: string } }) {
  redirect(`/collab/${params.slug}/mon-espace?onglet=conges`);
}
