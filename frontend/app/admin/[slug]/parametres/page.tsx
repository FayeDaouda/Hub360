import { redirect } from 'next/navigation';

// Ancienne adresse : les paramètres vivent dans Réglages › Administration.
export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  redirect(`/admin/${params.slug}/reglages?section=administration`);
}
