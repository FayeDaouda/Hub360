'use client';

import { FormEvent, useState } from 'react';
import { motDePasseOublie } from '@/lib/api';

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    try {
      const r = await motDePasseOublie(email);
      // Réponse constante : on l'affiche telle quelle, qu'il y ait un compte ou non.
      setMessage(r.message);
    } catch {
      setMessage(
        'Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.',
      );
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Mot de passe oublié</h1>
        {message ? (
          <>
            <p className="auth-subtitle">{message}</p>
            <a href="/" className="auth-back">
              ← Retour au portail
            </a>
          </>
        ) : (
          <>
            <p className="auth-subtitle">
              Saisis ton email : si un compte existe, tu recevras un lien pour définir un
              nouveau mot de passe.
            </p>
            <form className="auth-form" onSubmit={soumettre}>
              <input
                type="email"
                className="auth-input"
                placeholder="Email"
                aria-label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
              <button type="submit" className="auth-submit" disabled={enCours}>
                {enCours ? 'Envoi…' : 'Envoyer le lien'}
              </button>
            </form>
            <a href="/" className="auth-back">
              ← Retour au portail
            </a>
          </>
        )}
      </div>
    </main>
  );
}
