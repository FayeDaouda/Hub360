import { redirect } from 'next/navigation';

// L'espace /collab a été retiré (phase 1, 14/10/2026) : le rôle collaborateur
// est fondu dans Salarié. Toute ancienne adresse renvoie vers /espace, qui
// oriente chaque compte vers son écran d'arrivée.
export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  redirect(`/espace/${params.slug}`);
}
