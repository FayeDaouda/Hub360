'use client';

import { FormEvent, useState } from 'react';
import { LoaderCircle, Mail } from 'lucide-react';
import Link from 'next/link';
import { motDePasseOublie } from '@/lib/api';
import { ContenuAcces } from '@/components/auth/acces';
import { AuthChamp } from '@/components/auth/auth-champ';

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    try {
      const r = await motDePasseOublie(email.trim());
      // Réponse constante : on l'affiche telle quelle, qu'il y ait un compte ou non.
      setMessage(r.message);
    } catch {
      setMessage('Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.');
    }
  }

  return (
    <ContenuAcces>
      <section className="auth-carte" aria-labelledby="oubli-titre">
        <header className="auth-carte-entete">
          <h1 id="oubli-titre" className="auth-carte-titre">
            Mot de passe oublié
          </h1>
          {!message && (
            <p className="auth-carte-sous-titre">
              Saisis ton email : si un compte existe, tu recevras un lien pour définir un nouveau mot de passe.
            </p>
          )}
        </header>
        {message ? (
          <p className="auth-message" role="status">
            {message}
          </p>
        ) : (
          <form className="auth-formulaire" onSubmit={soumettre} aria-busy={enCours}>
            <AuthChamp
              icone={Mail}
              libelle="Adresse e-mail"
              type="email"
              name="email"
              placeholder="exemple@hub360.com"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
            <button type="submit" className="auth-bouton" disabled={enCours}>
              {enCours && <LoaderCircle className="auth-bouton-roue" size={18} strokeWidth={2.2} aria-hidden />}
              {enCours ? 'Envoi…' : 'Envoyer le lien'}
            </button>
          </form>
        )}
        <p className="auth-carte-pied">
          <Link href="/" className="auth-lien">
            ← Retour au portail
          </Link>
        </p>
      </section>
    </ContenuAcces>
  );
}
