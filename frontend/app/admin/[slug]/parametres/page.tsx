import { redirect } from 'next/navigation';

// Ancienne adresse : les paramètres vivent dans Réglages › Administration.
export default function Page({ params }: { params: { slug: string } }) {
  redirect(`/admin/${params.slug}/reglages?section=administration`);
}
