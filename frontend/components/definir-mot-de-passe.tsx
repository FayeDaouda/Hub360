'use client';

import { FormEvent, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { activerCompte, reinitialiserMotDePasse } from '@/lib/api';

type Mode = 'activation' | 'reset';

const TITRE: Record<Mode, string> = {
  activation: 'Activer votre compte',
  reset: 'Nouveau mot de passe',
};
const CTA: Record<Mode, string> = {
  activation: 'Activer le compte',
  reset: 'Changer le mot de passe',
};

export function DefinirMotDePasse({ mode }: { mode: Mode }) {
  const token = useSearchParams().get('token') ?? '';
  const [mdp, setMdp] = useState('');
  const [confirme, setConfirme] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (mdp.length < 10) {
      setErreur('Le mot de passe doit faire au moins 10 caractères.');
      return;
    }
    if (mdp !== confirme) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setEnCours(true);
    try {
      if (mode === 'activation') await activerCompte(token, mdp);
      else await reinitialiserMotDePasse(token, mdp);
      setFait(true);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Une erreur est survenue.');
      setEnCours(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-card">
        <h1>Lien invalide</h1>
        <p className="auth-subtitle">
          Ce lien est incomplet ou a expiré. Demande une nouvelle invitation à ton
          administrateur.
        </p>
        <a href="/" className="auth-back">
          ← Retour au portail
        </a>
      </div>
    );
  }

  if (fait) {
    return (
      <div className="auth-card">
        <h1>{mode === 'activation' ? 'Compte activé' : 'Mot de passe changé'}</h1>
        <p className="auth-subtitle">
          Tu peux maintenant te connecter avec ton mot de passe.
        </p>
        <a href="/" className="auth-submit" style={{ textDecoration: 'none', textAlign: 'center' }}>
          Aller à la connexion
        </a>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>{TITRE[mode]}</h1>
      <p className="auth-subtitle">Choisis un mot de passe d&rsquo;au moins 10 caractères.</p>
      <form className="auth-form" onSubmit={soumettre}>
        <input
          type="password"
          className="auth-input"
          placeholder="Mot de passe"
          aria-label="Mot de passe"
          value={mdp}
          onChange={(e) => setMdp(e.target.value)}
          autoFocus
          required
        />
        <input
          type="password"
          className="auth-input"
          placeholder="Confirmer le mot de passe"
          aria-label="Confirmer le mot de passe"
          value={confirme}
          onChange={(e) => setConfirme(e.target.value)}
          required
        />
        {erreur && <p className="auth-error">{erreur}</p>}
        <button type="submit" className="auth-submit" disabled={enCours}>
          {enCours ? 'Enregistrement…' : CTA[mode]}
        </button>
      </form>
      <a href="/" className="auth-back">
        ← Retour au portail
      </a>
    </div>
  );
}
