'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { BellRing, KeyRound, LifeBuoy, Palette, ShieldCheck, UserRound } from 'lucide-react';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { definirSonActive, sonActive } from '@/lib/notification-sound';
import { usePreferenceTheme } from '@/lib/theme';
import { ouvrirAide } from '@/components/admin/aide-globale';
import { ChangerMotDePasseModal } from '@/components/auth/changer-mot-de-passe-modal';
import { DoubleFacteurCompte } from '@/components/auth/double-facteur-compte';
import { OPTIONS_THEME } from '@/components/selecteur-theme';

// « CEO (transverse) » → « CEO » ; socle technique en clair.
const libelleRole = (role: string) => (role === 'societe_admin' ? 'Administration de la société' : role.replace(/\s*\(transverse\)$/, ''));

// Réglages personnels (revue Salarié 19/10/2026) : ce que chacun règle pour
// lui-même — compte, mot de passe, double authentification, apparence, son.
// Les Réglages du HUB (gabarit, règles, rôles) restent au CIO.
export function MesReglages() {
  useTitrePage('Réglages');
  const session = useSessionCourante();
  const { preference, choisir } = usePreferenceTheme();
  const [mdp, setMdp] = useState(false);
  const [son, setSon] = useState(true);
  useEffect(() => setSon(sonActive()), []);

  return (
    <div className="rg-page">
      <Bloc icone={UserRound} titre="Mon compte">
        <dl className="fc-liste">
          <dt>Nom</dt>
          <dd>
            {session.utilisateur.prenom} {session.utilisateur.nom}
          </dd>
          <dt>E-mail de connexion</dt>
          <dd>{session.utilisateur.email}</dd>
          <dt>Rôle</dt>
          <dd>{libelleRole(session.role)}</dd>
          <dt>Société</dt>
          <dd>{session.societe.nom}</dd>
        </dl>
        <p className="dmd-note">
          Poste, téléphone et coordonnées : Mon espace › Mon dossier › Mes informations. Nom, e-mail ou rôle à corriger : voyez avec la
          RH.
        </p>
      </Bloc>

      <Bloc icone={KeyRound} titre="Mot de passe">
        <p className="dmd-note">Au moins 10 caractères. Vos autres appareils devront se reconnecter après le changement.</p>
        <button type="button" className="btn-ghost btn-ghost--sm rg-bouton" onClick={() => setMdp(true)}>
          Changer mon mot de passe
        </button>
      </Bloc>

      <Bloc icone={ShieldCheck} titre="Double authentification">
        <DoubleFacteurCompte />
      </Bloc>

      <Bloc icone={Palette} titre="Apparence">
        <div className="vue-toggle" role="radiogroup" aria-label="Thème">
          {OPTIONS_THEME.map(({ valeur, libelle, Icone }) => (
            <button
              key={valeur}
              type="button"
              role="radio"
              aria-checked={preference === valeur}
              className={`rg-theme${preference === valeur ? ' is-active' : ''}`}
              onClick={() => choisir(valeur)}
            >
              <Icone size={14} aria-hidden /> {libelle}
            </button>
          ))}
        </div>
        <p className="dmd-note">« Système » suit le réglage clair ou sombre de votre appareil.</p>
      </Bloc>

      <Bloc icone={BellRing} titre="Notifications">
        <label className="po-miennes">
          <input
            type="checkbox"
            checked={son}
            onChange={(e) => {
              definirSonActive(e.target.checked);
              setSon(e.target.checked);
            }}
          />
          Son à l’arrivée d’une notification ou d’un message
        </label>
        <p className="dmd-note">Réglé pour cet appareil seulement.</p>
      </Bloc>

      <Bloc icone={LifeBuoy} titre="Aide">
        <p className="dmd-note">Votre guide selon vos droits, et « Signaler un problème » à l’équipe du HUB.</p>
        <div className="dmd-actions">
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => ouvrirAide('guide')}>
            Ouvrir mon guide
          </button>
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => ouvrirAide('signaler')}>
            Signaler un problème
          </button>
        </div>
      </Bloc>

      {mdp && <ChangerMotDePasseModal onClose={() => setMdp(false)} />}
    </div>
  );
}

function Bloc({ icone: Icone, titre, children }: { icone: typeof UserRound; titre: string; children: ReactNode }) {
  return (
    <section className="panel glass-panel dmd-section rg-bloc">
      <h2 className="dmd-titre">
        <Icone size={17} aria-hidden /> {titre}
      </h2>
      {children}
    </section>
  );
}
