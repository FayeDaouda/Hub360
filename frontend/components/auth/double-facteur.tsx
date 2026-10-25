'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, CircleAlert, KeyRound, LoaderCircle } from 'lucide-react';
import { activerDoubleFacteur, connexionAvecCode, preparerDoubleFacteur, type EtapeConnexion } from '@/lib/api';
import type { Session } from '@/lib/types';
import { AuthChamp } from './auth-champ';

type Props = { etape: EtapeConnexion; onSession: (s: Session) => void; onRetour: () => void };

// Étape après le mot de passe : code de l'application d'authentification,
// ou — la première fois, pour la direction — son activation (QR code, premier
// code, codes de secours à conserver).
export function DoubleFacteur({ etape, onSession, onRetour }: Props) {
  return etape.etape === 'code' ? (
    <SaisieCode jeton={etape.jeton} onSession={onSession} onRetour={onRetour} />
  ) : (
    <Activation jeton={etape.jeton} onSession={onSession} onRetour={onRetour} />
  );
}

function Erreur({ texte }: { texte: string | null }) {
  if (!texte) return null;
  return (
    <p className="auth-erreur" role="alert">
      <CircleAlert size={17} aria-hidden />
      {texte}
    </p>
  );
}

function Bouton({ enCours, libelle }: { enCours: boolean; libelle: string }) {
  return (
    <button type="submit" className="auth-bouton" disabled={enCours}>
      {enCours ? (
        <>
          <LoaderCircle className="auth-bouton-roue" size={18} strokeWidth={2.2} aria-hidden />
          Vérification…
        </>
      ) : (
        <>
          {libelle}
          <ArrowRight className="auth-bouton-fleche" size={18} strokeWidth={2.2} aria-hidden />
        </>
      )}
    </button>
  );
}

function SaisieCode({
  jeton,
  onSession,
  onRetour,
}: {
  jeton: string;
  onSession: (s: Session) => void;
  onRetour: () => void;
}) {
  const [code, setCode] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      onSession(await connexionAvecCode(jeton, code));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Code incorrect.');
      setEnCours(false);
    }
  }

  return (
    <form className="auth-formulaire" onSubmit={valider} aria-busy={enCours}>
      <p className="auth-df-texte">
        Ouvrez votre application d’authentification et saisissez le code à 6 chiffres affiché pour HUB 360.
      </p>
      <AuthChamp
        icone={KeyRound}
        libelle="Code de vérification"
        name="code"
        placeholder="123 456"
        autoComplete="one-time-code"
        inputMode="text"
        maxLength={20}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
        required
      />
      <p className="auth-df-aide">Téléphone indisponible ? Saisissez l’un de vos codes de secours (XXXX-XXXX).</p>
      <Erreur texte={erreur} />
      <Bouton enCours={enCours} libelle="Valider" />
      <button type="button" className="auth-lien auth-df-retour" onClick={onRetour}>
        Revenir au mot de passe
      </button>
    </form>
  );
}

function Activation({
  jeton,
  onSession,
  onRetour,
}: {
  jeton: string;
  onSession: (s: Session) => void;
  onRetour: () => void;
}) {
  const [reglage, setReglage] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fin, setFin] = useState<{ session: Session; codes: string[] } | null>(null);
  const [note, setNote] = useState(false);

  useEffect(() => {
    preparerDoubleFacteur(jeton)
      .then(setReglage)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Préparation impossible.'));
  }, [jeton]);

  async function activer(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      const { codesSecours, ...session } = await activerDoubleFacteur(jeton, code);
      setFin({ session, codes: codesSecours });
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Code incorrect.');
    } finally {
      setEnCours(false);
    }
  }

  if (fin) {
    return (
      <div className="auth-formulaire">
        <p className="auth-df-texte">
          <strong>Double authentification activée.</strong> Voici vos 8 codes de secours : chacun remplace une fois le
          code du téléphone si vous le perdez. Ils ne seront plus jamais affichés.
        </p>
        <ul className="auth-df-codes">
          {fin.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button
          type="button"
          className="auth-lien"
          onClick={() => navigator.clipboard?.writeText(fin.codes.join('\n'))}
        >
          Copier les codes
        </button>
        <label className="auth-case">
          <input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} />
          J’ai mis ces codes en lieu sûr
        </label>
        <button type="button" className="auth-bouton" disabled={!note} onClick={() => onSession(fin.session)}>
          Accéder au HUB
          <ArrowRight className="auth-bouton-fleche" size={18} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <form className="auth-formulaire" onSubmit={activer} aria-busy={enCours}>
      <p className="auth-df-texte">
        Votre rôle demande une <strong>double authentification</strong> : un code à 6 chiffres, renouvelé toutes les 30
        secondes sur votre téléphone, en plus du mot de passe. À faire une seule fois :
      </p>
      <ol className="auth-df-etapes">
        <li>Installez Google Authenticator ou Microsoft Authenticator sur votre téléphone.</li>
        <li>Dans l’application, ajoutez un compte en scannant ce QR code.</li>
        <li>Saisissez ci-dessous le code affiché.</li>
      </ol>
      {reglage ? (
        <div className="auth-df-qr">
          {/* data URI généré par le serveur : pas d'optimisation next/image utile. */}
          <img
            src={reglage.qr}
            alt="QR code à scanner avec l’application d’authentification"
            width={180}
            height={180}
          />
          <span className="auth-df-aide">
            Pas de scan possible ? Saisissez la clé : <code>{reglage.secret.match(/.{1,4}/g)?.join(' ')}</code>
          </span>
        </div>
      ) : (
        !erreur && <p className="auth-df-aide">Préparation du QR code…</p>
      )}
      <AuthChamp
        icone={KeyRound}
        libelle="Code de l’application"
        name="code"
        placeholder="123 456"
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        required
      />
      <Erreur texte={erreur} />
      <Bouton enCours={enCours} libelle="Activer" />
      <button type="button" className="auth-lien auth-df-retour" onClick={onRetour}>
        Revenir au mot de passe
      </button>
    </form>
  );
}
