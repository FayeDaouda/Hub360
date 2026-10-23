'use client';

import {
  InputHTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  useId,
  useRef,
  useState,
} from 'react';
import { ArrowBigUp, Eye, EyeOff, type LucideIcon } from 'lucide-react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  libelle: string;
  icone: LucideIcon;
};

// Champ des écrans d'authentification (maquette sept. 2026) : icône, libellé
// au-dessus de la saisie, dans une même boîte vitrée. Pour un mot de passe :
// bouton afficher/masquer + avertissement Verr. Maj (erreur de saisie n° 1
// sur un écran de connexion). Toute la boîte est cliquable.
export function AuthChamp({
  libelle,
  icone: Icone,
  type = 'text',
  id,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...saisie
}: Props) {
  const idAuto = useId();
  const idChamp = id ?? idAuto;
  const idAlerte = `${idChamp}-majuscules`;
  const refSaisie = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const [majuscules, setMajuscules] = useState(false);
  const motDePasse = type === 'password';

  function focaliser(evenement: MouseEvent<HTMLDivElement>) {
    // Le libellé (htmlFor) et le bouton gèrent déjà leur propre clic.
    if ((evenement.target as HTMLElement).closest('input, label, button')) return;
    evenement.preventDefault();
    refSaisie.current?.focus();
  }

  function suivreMajuscules(evenement: KeyboardEvent<HTMLInputElement>) {
    if (motDePasse) setMajuscules(evenement.getModifierState('CapsLock'));
  }

  return (
    <div className="auth-champ-groupe">
      <div className="auth-champ" onMouseDown={focaliser}>
        <Icone className="auth-champ-icone" size={20} aria-hidden />
        <div className="auth-champ-corps">
          <label htmlFor={idChamp} className="auth-champ-libelle">
            {libelle}
          </label>
          <input
            {...saisie}
            ref={refSaisie}
            id={idChamp}
            type={motDePasse && visible ? 'text' : type}
            className="auth-champ-saisie"
            aria-describedby={
              [saisie['aria-describedby'], majuscules ? idAlerte : null].filter(Boolean).join(' ') ||
              undefined
            }
            onKeyDown={(e) => {
              suivreMajuscules(e);
              onKeyDown?.(e);
            }}
            onKeyUp={(e) => {
              suivreMajuscules(e);
              onKeyUp?.(e);
            }}
            onBlur={(e) => {
              setMajuscules(false);
              onBlur?.(e);
            }}
          />
        </div>
        {motDePasse && (
          <button
            type="button"
            className="auth-champ-oeil"
            aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={visible}
            aria-controls={idChamp}
            title={visible ? 'Masquer' : 'Afficher'}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? (
              <EyeOff size={19} aria-hidden />
            ) : (
              <Eye size={19} aria-hidden />
            )}
          </button>
        )}
      </div>
      {/* Région live présente dès le rendu (sinon l'annonce est souvent
          perdue par les lecteurs d'écran) — vide tant que Verr. Maj est off. */}
      {motDePasse && (
        <p id={idAlerte} className="auth-champ-alerte" aria-live="polite">
          {majuscules && (
            <>
              <ArrowBigUp size={14} aria-hidden />
              Verrouillage des majuscules activé
            </>
          )}
        </p>
      )}
    </div>
  );
}
