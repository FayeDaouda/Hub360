'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { apiAuth } from '@/lib/client-api';
import { formatDate } from '@/lib/dates';
import { Pill } from '@/components/ui/pill';

type Etat = { actifLe: string | null; exige: boolean };
type Reglage = { secret: string; qr: string };

// Double authentification depuis « Mon compte » (revue Salarié 19/10/2026) :
// facultative pour le Salarié, qui l'active ici ; la direction et les chefs
// de cellule l'activent de toute façon à la connexion. Même parcours qu'à la
// connexion (QR, premier code, 8 codes de secours) ; la session reste ouverte.
// Désactiver ou changer de téléphone : réinitialisation par le CIO.
export function DoubleFacteurCompte() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [reglage, setReglage] = useState<Reglage | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    apiAuth<Etat>('/auth/double-facteur')
      .then(setEtat)
      .catch(() => setEtat(null));
  }, []);

  async function commencer() {
    setBusy(true);
    setErreur(null);
    try {
      setReglage(await apiAuth<Reglage>('/auth/double-facteur/compte/preparation', { method: 'POST', body: {} }));
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'Préparation impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function activer(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErreur(null);
    try {
      const r = await apiAuth<{ codesSecours: string[] }>('/auth/double-facteur/compte/activation', {
        method: 'POST',
        body: { code },
      });
      setCodes(r.codesSecours);
      setEtat((x) => (x ? { ...x, actifLe: new Date().toISOString() } : x));
    } catch (err) {
      setErreur(err instanceof Error && err.message ? err.message : 'Code incorrect.');
    } finally {
      setBusy(false);
    }
  }

  if (!etat) return null;

  if (codes) {
    return (
      <div className="df-compte">
        <p>
          <strong>Double authentification activée.</strong> Voici vos 8 codes de secours : chacun remplace une fois le
          code du téléphone si vous le perdez. Ils ne seront plus jamais affichés.
        </p>
        <ul className="df-compte-codes">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button
          type="button"
          className="btn-ghost btn-ghost--sm"
          onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}
        >
          Copier les codes
        </button>
      </div>
    );
  }

  if (etat.actifLe) {
    return (
      <p className="dmd-note">
        <Pill tone="succes">Activée</Pill> depuis le {formatDate(etat.actifLe)}. Téléphone perdu ou changé : demandez au
        CIO de la réinitialiser.
      </p>
    );
  }

  if (!reglage) {
    return (
      <div className="df-compte">
        <p className="dmd-note">
          {etat.exige
            ? 'Obligatoire pour votre rôle : elle vous sera demandée à la prochaine connexion. Vous pouvez l’activer dès maintenant.'
            : 'Facultative, recommandée si vous ouvrez le HUB hors du bureau : un code à 6 chiffres de votre téléphone, en plus du mot de passe.'}
        </p>
        {erreur && <p className="field-erreur">{erreur}</p>}
        <button type="button" className="btn-ghost btn-ghost--sm" disabled={busy} onClick={commencer}>
          Activer la double authentification
        </button>
      </div>
    );
  }

  return (
    <form className="df-compte" onSubmit={activer}>
      <ol className="df-compte-etapes">
        <li>Installez Google Authenticator ou Microsoft Authenticator sur votre téléphone.</li>
        <li>Dans l’application, ajoutez un compte en scannant ce QR code.</li>
        <li>Saisissez ci-dessous le code affiché.</li>
      </ol>
      <div className="df-compte-qr">
        {/* data URI généré par le serveur : pas d'optimisation next/image utile. */}
        <img src={reglage.qr} alt="QR code à scanner avec l’application d’authentification" width={160} height={160} />
        <span className="dmd-note">
          Pas de scan possible ? Clé : <code>{reglage.secret.match(/.{1,4}/g)?.join(' ')}</code>
        </span>
      </div>
      <label className="field">
        <span className="field-label">Code de l’application</span>
        <input
          className="field-input"
          name="code"
          placeholder="123 456"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          required
        />
      </label>
      {erreur && <p className="field-erreur">{erreur}</p>}
      <div className="modal-actions">
        <button type="submit" className="btn-primary" disabled={busy || code.length !== 6}>
          {busy ? 'Vérification…' : 'Activer'}
        </button>
      </div>
    </form>
  );
}
