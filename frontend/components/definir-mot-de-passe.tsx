'use client';

import { FormEvent, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CircleAlert, LoaderCircle, Lock } from 'lucide-react';
import Link from 'next/link';
import { activerCompte, reinitialiserMotDePasse } from '@/lib/api';
import { AuthChamp } from '@/components/auth/auth-champ';

type Mode = 'activation' | 'reset';

const TITRE: Record<Mode, string> = {
  activation: 'Activer votre compte',
  reset: 'Nouveau mot de passe',
};
const CTA: Record<Mode, string> = {
  activation: 'Activer le compte',
  reset: 'Changer le mot de passe',
};
const ID_ERREUR = 'mdp-erreur';

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
      <section className="auth-carte" aria-labelledby="mdp-titre">
        <header className="auth-carte-entete">
          <h1 id="mdp-titre" className="auth-carte-titre">
            Lien invalide
          </h1>
          <p className="auth-carte-sous-titre">
            Ce lien est incomplet ou a expiré. Demande une nouvelle invitation à ton
            administrateur.
          </p>
        </header>
        <p className="auth-carte-pied">
          <Link href="/" className="auth-lien">
            ← Retour au portail
          </Link>
        </p>
      </section>
    );
  }

  if (fait) {
    return (
      <section className="auth-carte" aria-labelledby="mdp-titre">
        <header className="auth-carte-entete">
          <h1 id="mdp-titre" className="auth-carte-titre">
            {mode === 'activation' ? 'Compte activé' : 'Mot de passe changé'}
          </h1>
          <p className="auth-carte-sous-titre">
            Tu peux maintenant te connecter avec ton mot de passe.
          </p>
        </header>
        <Link href="/" className="auth-bouton">
          Aller à la connexion
        </Link>
      </section>
    );
  }

  return (
    <section className="auth-carte" aria-labelledby="mdp-titre">
      <header className="auth-carte-entete">
        <h1 id="mdp-titre" className="auth-carte-titre">
          {TITRE[mode]}
        </h1>
        <p className="auth-carte-sous-titre">
          Choisis un mot de passe d&rsquo;au moins 10 caractères.
        </p>
      </header>
      <form className="auth-formulaire" onSubmit={soumettre} aria-busy={enCours}>
        <AuthChamp
          icone={Lock}
          libelle="Nouveau mot de passe"
          type="password"
          name="new-password"
          placeholder="Au moins 10 caractères"
          autoComplete="new-password"
          value={mdp}
          onChange={(e) => setMdp(e.target.value)}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? ID_ERREUR : undefined}
          autoFocus
          required
        />
        <AuthChamp
          icone={Lock}
          libelle="Confirmer le mot de passe"
          type="password"
          name="confirm-password"
          placeholder="Saisir à nouveau"
          autoComplete="new-password"
          value={confirme}
          onChange={(e) => setConfirme(e.target.value)}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? ID_ERREUR : undefined}
          required
        />
        {erreur && (
          <p id={ID_ERREUR} className="auth-erreur" role="alert">
            <CircleAlert size={17} aria-hidden />
            {erreur}
          </p>
        )}
        <button type="submit" className="auth-bouton" disabled={enCours}>
          {enCours && (
            <LoaderCircle className="auth-bouton-roue" size={18} strokeWidth={2.2} aria-hidden />
          )}
          {enCours ? 'Enregistrement…' : CTA[mode]}
        </button>
      </form>
      <p className="auth-carte-pied">
        <Link href="/" className="auth-lien">
          ← Retour au portail
        </Link>
      </p>
    </section>
  );
}
