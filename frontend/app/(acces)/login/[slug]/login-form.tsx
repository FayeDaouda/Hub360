'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CircleAlert, Info, LoaderCircle, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { EchecConnexion, estEtape, login, type EtapeConnexion, type MotifEchecConnexion } from '@/lib/api';
import { saveSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import { AuthChamp } from '@/components/auth/auth-champ';
import { DoubleFacteur } from '@/components/auth/double-facteur';
import type { Session } from '@/lib/types';

const MESSAGE_ECHEC: Record<MotifEchecConnexion, string> = {
  identifiants: 'Adresse e-mail ou mot de passe incorrect.',
  trop_de_tentatives: 'Trop de tentatives. Patientez une minute avant de réessayer.',
  verrouille:
    'Compte verrouillé après trop d’essais infructueux. Réessayez plus tard ou demandez au CIO de le débloquer.',
  reseau: 'Serveur injoignable. Vérifiez votre connexion internet puis réessayez.',
  serveur: 'Service momentanément indisponible. Réessayez dans un instant.',
};

const ID_ERREUR = 'connexion-erreur';

export function LoginForm({ societeSlug }: { societeSlug: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Retour après une session coupée (déconnexion de tous les appareils, mot
  // de passe réinitialisé…) : on dit pourquoi, sans alarmer.
  const sessionExpiree = useSearchParams().get('session') === 'expiree';
  const [loading, setLoading] = useState(false);
  // Double authentification : étape rendue par le serveur après le mot de passe.
  const [etape, setEtape] = useState<EtapeConnexion | null>(null);

  function entrer(session: Session) {
    saveSession(session, remember);
    router.push(destinationForSession(session));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const reponse = await login(email.trim(), motDePasse, societeSlug);
      if (estEtape(reponse)) {
        setEtape(reponse);
        setLoading(false);
        return;
      }
      // loading reste vrai jusqu'au changement de page : pas de double envoi.
      entrer(reponse);
    } catch (err) {
      setError(err instanceof EchecConnexion ? (err.detail ?? MESSAGE_ECHEC[err.motif]) : MESSAGE_ECHEC.serveur);
      setLoading(false);
    }
  }

  const invalide = error !== null;

  if (etape) {
    return (
      <DoubleFacteur
        etape={etape}
        onSession={entrer}
        onRetour={() => {
          setEtape(null);
          setMotDePasse('');
        }}
      />
    );
  }

  return (
    <form className="auth-formulaire" onSubmit={handleSubmit} aria-busy={loading}>
      <AuthChamp
        icone={Mail}
        libelle="Adresse e-mail"
        type="email"
        name="email"
        placeholder="exemple@hub360.com"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={invalide || undefined}
        aria-describedby={invalide ? ID_ERREUR : undefined}
        autoFocus
        required
      />
      <AuthChamp
        icone={Lock}
        libelle="Mot de passe"
        type="password"
        name="password"
        placeholder="Votre mot de passe"
        autoComplete="current-password"
        value={motDePasse}
        onChange={(e) => setMotDePasse(e.target.value)}
        aria-invalid={invalide || undefined}
        aria-describedby={invalide ? ID_ERREUR : undefined}
        required
      />

      <div className="auth-options">
        <label className="auth-case">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Se souvenir de moi
        </label>
        <Link href="/mot-de-passe-oublie" className="auth-lien">
          Mot de passe oublié&nbsp;?
        </Link>
      </div>

      {sessionExpiree && !error && (
        <p className="auth-info" role="status">
          <Info size={17} aria-hidden />
          Votre session a été fermée. Reconnectez-vous pour continuer.
        </p>
      )}
      {error && (
        <p id={ID_ERREUR} className="auth-erreur" role="alert">
          <CircleAlert size={17} aria-hidden />
          {error}
        </p>
      )}

      <button type="submit" className="auth-bouton" disabled={loading}>
        {loading ? (
          <>
            <LoaderCircle className="auth-bouton-roue" size={18} strokeWidth={2.2} aria-hidden />
            Connexion…
          </>
        ) : (
          <>
            Se connecter
            <ArrowRight className="auth-bouton-fleche" size={18} strokeWidth={2.2} aria-hidden />
          </>
        )}
      </button>
    </form>
  );
}
