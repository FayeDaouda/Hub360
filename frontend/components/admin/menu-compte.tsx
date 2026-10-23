'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent as KeyboardEventReact } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleHelp, IdCard, KeyRound, LogOut, PenLine, MessageSquareWarning, Settings, ShieldAlert, ShieldCheck, UserRound } from 'lucide-react';
import type { Session } from '@/lib/types';
import { apiAuth } from '@/lib/client-api';
import { libelleRole } from '@/lib/groupe';
import { usePreferenceTheme } from '@/lib/theme';
import { OPTIONS_THEME } from '@/components/selecteur-theme';
import { ouvrirAide } from '@/components/admin/aide-globale';
import { ChangerMotDePasseModal } from '@/components/auth/changer-mot-de-passe-modal';
import { AvatarPersonne } from '@/components/avatar-personne';
import { ProfilModal } from '@/components/admin/profil-modal';
import { nomAffiche } from '@/lib/profil';

// Menu du compte (avatar, en haut à droite) : qui je suis (nom, e-mail, rôle,
// société), l'état de ma double authentification, mes accès personnels
// (Mon espace, Mon dossier, Réglages du compte, mot de passe), l'apparence,
// l'aide et la déconnexion. Uniquement des fonctions existantes du HUB.
// Clavier : Entrée / Espace ouvre, flèches haut / bas parcourent, Échap
// referme et rend le focus à l'avatar.

type EtatDoubleFacteur = { actifLe: string | null; exige: boolean };

export function MenuCompte({ session, base, onDeconnexion }: { session: Session; base: string; onDeconnexion: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [mdp, setMdp] = useState(false);
  const [profil, setProfil] = useState(false);
  const [doubleFacteur, setDoubleFacteur] = useState<EtatDoubleFacteur | null>(null);
  const { preference, choisir } = usePreferenceTheme();
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const id = useId();
  const chemin = usePathname();
  const u = session.utilisateur;
  const affiche = nomAffiche(u);

  // Changement de page : le menu se referme.
  useEffect(() => setOuvert(false), [chemin]);

  // État de la double authentification, lu à l'ouverture.
  useEffect(() => {
    if (!ouvert) return;
    apiAuth<EtatDoubleFacteur>('/auth/double-facteur')
      .then(setDoubleFacteur)
      .catch(() => setDoubleFacteur(null));
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOuvert(false);
        bouton.current?.focus();
      }
    };
    document.addEventListener('mousedown', surClic);
    document.addEventListener('keydown', surTouche);
    // Focus sur le premier élément du menu à l'ouverture.
    liste.current?.querySelector<HTMLElement>('[data-item]')?.focus();
    return () => {
      document.removeEventListener('mousedown', surClic);
      document.removeEventListener('keydown', surTouche);
    };
  }, [ouvert]);

  // Flèches : passer d'un élément à l'autre (en boucle).
  function naviguer(e: KeyboardEventReact<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(liste.current?.querySelectorAll<HTMLElement>('[data-item]') ?? [])];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const suivant = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[suivant]?.focus();
  }

  const fermer = () => setOuvert(false);
  const securise = !!doubleFacteur?.actifLe;

  return (
    <div ref={racine} className="mc">
      <button
        ref={bouton}
        type="button"
        className="admin-user"
        aria-label={`Mon compte · ${affiche}`}
        aria-haspopup="true"
        aria-expanded={ouvert}
        aria-controls={id}
        onClick={() => setOuvert((o) => !o)}
      >
        <AvatarPersonne nom={affiche} photo={u.photoUrl} cle={u.id} taille="md" />
      </button>

      {ouvert && (
        <div id={id} ref={liste} className="mc-menu" role="dialog" aria-label="Mon compte" onKeyDown={naviguer}>
          <div className="mc-identite">
            <AvatarPersonne nom={affiche} photo={u.photoUrl} cle={u.id} taille="lg" />
            <span className="mc-qui">
              <strong>{affiche}</strong>
              <span className="mc-email">{u.email}</span>
              <span className="mc-role">
                {libelleRole(session.role)} · {session.societe.nom}
              </span>
            </span>
          </div>

          {/* Sécurité du compte : état réel de la double authentification. */}
          {doubleFacteur && (
            <Link
              href={`${base}/mes-reglages`}
              className={`mc-securite${securise ? ' is-ok' : ''}`}
              data-item
              onClick={fermer}
            >
              {securise ? <ShieldCheck size={16} aria-hidden /> : <ShieldAlert size={16} aria-hidden />}
              <span>
                {securise ? 'Double authentification activée' : 'Double authentification à activer'}
                {!securise && doubleFacteur.exige && <span className="mc-securite-exigee"> · exigée pour votre rôle</span>}
              </span>
            </Link>
          )}

          <nav className="mc-groupe" aria-label="Mes accès">
            <button
              type="button"
              className="mc-item"
              data-item
              onClick={() => {
                fermer();
                setProfil(true);
              }}
            >
              <PenLine size={16} aria-hidden /> Modifier mon profil
              <span className="mc-item-aide">photo, nom affiché</span>
            </button>
            <Link href={`${base}/mon-espace`} className="mc-item" data-item onClick={fermer}>
              <UserRound size={16} aria-hidden /> Mon espace
            </Link>
            <Link href={`${base}/mon-espace?onglet=informations`} className="mc-item" data-item onClick={fermer}>
              <IdCard size={16} aria-hidden /> Mon dossier
            </Link>
            <Link href={`${base}/mes-reglages`} className="mc-item" data-item onClick={fermer}>
              <Settings size={16} aria-hidden /> Réglages du compte
            </Link>
            <button
              type="button"
              className="mc-item"
              data-item
              onClick={() => {
                fermer();
                setMdp(true);
              }}
            >
              <KeyRound size={16} aria-hidden /> Changer le mot de passe
            </button>
          </nav>

          <div className="mc-groupe">
            <span className="mc-libelle" id={`${id}-theme`}>
              Apparence
            </span>
            <div className="mc-theme" role="radiogroup" aria-labelledby={`${id}-theme`}>
              {OPTIONS_THEME.map(({ valeur, libelle, Icone }) => (
                <button
                  key={valeur}
                  type="button"
                  role="radio"
                  aria-checked={preference === valeur}
                  className={preference === valeur ? 'is-actif' : undefined}
                  data-item
                  onClick={() => choisir(valeur)}
                >
                  <Icone size={14} aria-hidden /> {libelle}
                </button>
              ))}
            </div>
          </div>

          <div className="mc-groupe">
            <button
              type="button"
              className="mc-item"
              data-item
              onClick={() => {
                fermer();
                ouvrirAide('guide');
              }}
            >
              <CircleHelp size={16} aria-hidden /> Aide et raccourcis
            </button>
            <button
              type="button"
              className="mc-item"
              data-item
              onClick={() => {
                fermer();
                ouvrirAide('signaler');
              }}
            >
              <MessageSquareWarning size={16} aria-hidden /> Signaler un problème
            </button>
          </div>

          <div className="mc-groupe mc-pied">
            <button type="button" className="mc-item mc-deconnexion" data-item onClick={onDeconnexion}>
              <LogOut size={16} aria-hidden /> Se déconnecter
            </button>
          </div>
        </div>
      )}

      {mdp && <ChangerMotDePasseModal onClose={() => setMdp(false)} />}
      {profil && <ProfilModal onClose={() => setProfil(false)} />}
    </div>
  );
}
