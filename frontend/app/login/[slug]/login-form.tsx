'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { saveSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';

export function LoginForm({ societeSlug }: { societeSlug: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await login(email, motDePasse, societeSlug);
      saveSession(session, remember);
      router.push(destinationForSession(session));
    } catch {
      setError('Email ou mot de passe incorrect.');
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
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
      <input
        type="password"
        className="auth-input"
        placeholder="Mot de passe"
        aria-label="Mot de passe"
        value={motDePasse}
        onChange={(e) => setMotDePasse(e.target.value)}
        required
      />

      <label className="auth-remember">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        Se souvenir de moi
      </label>

      {error && <p className="auth-error">{error}</p>}

      <button type="submit" className="auth-submit" disabled={loading}>
        {loading ? 'Connexion...' : 'Se connecter'}
      </button>

      <a href="/mot-de-passe-oublie" className="auth-lien-discret">
        Mot de passe oublié&nbsp;?
      </a>
    </form>
  );
}
