import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CompanyAvatar } from '@/components/ui/avatar';
import { getSociete } from '@/lib/api';
import { LoginForm } from './login-form';

type Props = {
  params: Promise<{ slug: string }>;
};

// getSociete est appelé ici ET dans la page : Next mémoïse le fetch sur la
// requête, un seul appel réseau.
export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const societe = await getSociete(params.slug);
  return { title: societe ? `Connexion · ${societe.nom} — hub360°` : 'Connexion — hub360°' };
}

export default async function LoginPage(props: Props) {
  const params = await props.params;
  const societe = await getSociete(params.slug);
  if (!societe) notFound();

  // Cadre et présentation posés par les layouts (acces) et login/[slug].
  // Tuile de la société choisie en tête de carte : on sait d'un coup d'œil
  // dans quelle société on se connecte (groupe multi-sociétés).
  const tuile = { '--societe-color': societe.couleurMarque || '#a5a398' } as CSSProperties;
  return (
    <section className="auth-carte" aria-labelledby="connexion-titre">
      <header className="auth-carte-entete auth-carte-entete--societe">
        <span className="auth-carte-societe" style={tuile}>
          {/* alt vide : le nom est écrit juste à côté. */}
          <CompanyAvatar company={societe} theme="glass" alt="" />
        </span>
        <div>
          <h1 id="connexion-titre" className="auth-carte-titre">
            Connexion
          </h1>
          <p className="auth-carte-sous-titre">
            Accédez à votre espace <strong>{societe.nom}</strong>
          </p>
        </div>
      </header>
      <LoginForm societeSlug={societe.slug} />
      <p className="auth-carte-pied">
        Pas la bonne société&nbsp;?{' '}
        <Link href="/" className="auth-lien">
          Changer de société
        </Link>
      </p>
    </section>
  );
}
