import { notFound } from 'next/navigation';
import { getSociete } from '@/lib/api';
import { SocieteAvatar } from '@/components/societe-avatar';
import { LoginForm } from './login-form';

type Props = {
  params: { slug: string };
};

export default async function LoginPage({ params }: Props) {
  const societe = await getSociete(params.slug);
  if (!societe) notFound();

  return (
    <main className="auth-page">
      <div className="auth-card">
        <SocieteAvatar societe={societe} size="lg" theme="glass" />
        <h1>{societe.nom}</h1>
        <p className="auth-subtitle">Connecte-toi pour accéder à ton espace</p>
        <LoginForm societeSlug={societe.slug} />
        <a href="/" className="auth-back">
          ← Retour au portail
        </a>
      </div>
    </main>
  );
}
