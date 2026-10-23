'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, Info, Plus, SendHorizonal, X } from 'lucide-react';
import { FicheContactModal } from '@/components/contacts/fiche-contact';
import type {
  CanalChat,
  EtatFluxChat,
  MembreAnnuaire,
  MessageChat,
} from '@/lib/types';

type Props = {
  slug: string;
  moiId: string;
  ecriture: boolean; // false = lecture seule (matrice « communication »)
  etatFlux: EtatFluxChat;
  canaux: CanalChat[];
  canalActif: CanalChat | null;
  messages: MessageChat[];
  curseur: string | null;
  chargement: boolean;
  envoiEnCours: boolean;
  vueAnnuaire: boolean;
  annuaire: MembreAnnuaire[] | null;
  onFermer: () => void;
  onChoisirCanal: (id: string) => void;
  onRetourListe: () => void;
  onChargerPlus: () => void;
  onEnvoyer: (texte: string) => void;
  onOuvrirAnnuaire: () => void;
  onNouveauDm: (utilisateurId: string) => void;
};

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function jour(iso: string): string {
  const d = new Date(iso);
  const auj = new Date();
  const hier = new Date();
  hier.setDate(auj.getDate() - 1);
  if (d.toDateString() === auj.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === hier.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

const LIBELLE_ETAT: Record<EtatFluxChat, string> = {
  connexion: 'Connexion…',
  ouvert: 'En ligne',
  reconnexion: 'Reconnexion en cours…',
};

export function PanneauChat({
  slug,
  moiId,
  ecriture,
  etatFlux,
  canaux,
  canalActif,
  messages,
  curseur,
  chargement,
  envoiEnCours,
  vueAnnuaire,
  annuaire,
  onFermer,
  onChoisirCanal,
  onRetourListe,
  onChargerPlus,
  onEnvoyer,
  onOuvrirAnnuaire,
  onNouveauDm,
}: Props) {
  const [brouillon, setBrouillon] = useState('');
  const [fiche, setFiche] = useState<string | null>(null);
  const filRef = useRef<HTMLDivElement>(null);
  const presDuBas = useRef(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Fiche contact ouverte : Échap ne ferme qu'elle (son propre écouteur).
      if (e.key === 'Escape' && !fiche) onFermer();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFermer, fiche]);

  // Colle au bas du fil à l'arrivée d'un message, sauf si on remonte l'historique.
  useLayoutEffect(() => {
    const el = filRef.current;
    if (el && presDuBas.current) el.scrollTop = el.scrollHeight;
  }, [messages, canalActif?.id]);

  function surScroll() {
    const el = filRef.current;
    if (!el) return;
    presDuBas.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function envoyer() {
    const t = brouillon.trim();
    if (!t || envoiEnCours) return;
    setBrouillon('');
    presDuBas.current = true;
    onEnvoyer(t);
  }

  return (
    <div
      className="pchat"
      role="dialog"
      aria-modal="false"
      aria-label={canalActif ? `Conversation ${canalActif.nom}` : 'Messages'}
    >
      <header className="pchat-tete">
        {canalActif || vueAnnuaire ? (
          <button
            type="button"
            className="pchat-retour"
            onClick={onRetourListe}
            aria-label="Retour à la liste"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
        ) : null}
        <div className="pchat-tete-txt">
          <strong>
            {vueAnnuaire
              ? 'Nouvelle conversation'
              : canalActif
                ? canalActif.nom
                : 'Messages'}
          </strong>
          <span
            className={`pchat-etat pchat-etat--${etatFlux}`}
            role="status"
          >
            {etatFlux === 'ouvert' && <span className="pchat-etat-point" aria-hidden />}
            {LIBELLE_ETAT[etatFlux]}
          </span>
        </div>
        {ecriture && !canalActif && !vueAnnuaire && (
          <button
            type="button"
            className="pchat-fermer"
            onClick={onOuvrirAnnuaire}
            aria-label="Nouvelle conversation"
            title="Nouvelle conversation"
          >
            <Plus size={18} />
          </button>
        )}
        <button
          type="button"
          className="pchat-fermer"
          onClick={onFermer}
          aria-label="Fermer les messages"
        >
          <X size={18} />
        </button>
      </header>

      {vueAnnuaire ? (
        <ul className="pchat-liste">
          {annuaire === null ? (
            <li className="pchat-vide">Chargement…</li>
          ) : annuaire.length === 0 ? (
            <li className="pchat-vide">Personne d’autre dans la société.</li>
          ) : (
            annuaire.map((m) => (
              <li key={m.utilisateurId} className="pchat-annuaire-ligne">
                <button
                  type="button"
                  className="pchat-canal"
                  onClick={() => onNouveauDm(m.utilisateurId)}
                >
                  <span className="pchat-canal-pastille pchat-canal-pastille--direct" aria-hidden>
                    {m.prenom.charAt(0)}
                    {m.nom.charAt(0)}
                  </span>
                  <span className="pchat-canal-nom pchat-canal-nom--annuaire">
                    <span>
                      {m.prenom} {m.nom}
                    </span>
                    <span className="pchat-annuaire-role">
                      {m.role}
                      {m.cellule ? ` · ${m.cellule}` : ''}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="pchat-annuaire-fiche"
                  aria-label={`Fiche contact de ${m.prenom} ${m.nom}`}
                  title="Fiche contact"
                  onClick={() => setFiche(m.utilisateurId)}
                >
                  <Info size={16} />
                </button>
              </li>
            ))
          )}
        </ul>
      ) : !canalActif ? (
        <ul className="pchat-liste">
          {canaux.length === 0 ? (
            <li className="pchat-vide">Aucun canal.</li>
          ) : (
            canaux.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="pchat-canal"
                  onClick={() => onChoisirCanal(c.id)}
                >
                  <span className={`pchat-canal-pastille pchat-canal-pastille--${c.type}`} aria-hidden>
                    {c.type === 'direct' ? c.nom.charAt(0) : '#'}
                  </span>
                  <span className="pchat-canal-nom">{c.nom}</span>
                  {c.dernierMessageLe && (
                    <span className="pchat-canal-quand">{heure(c.dernierMessageLe)}</span>
                  )}
                  {c.nonLus > 0 && (
                    <span className="pchat-canal-badge">{c.nonLus}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : (
        <>
          <div className="pchat-fil" ref={filRef} onScroll={surScroll}>
            {curseur && (
              <button
                type="button"
                className="pchat-plus"
                onClick={onChargerPlus}
                disabled={chargement}
              >
                {chargement ? 'Chargement…' : 'Messages plus anciens'}
              </button>
            )}
            {messages.length === 0 && !chargement ? (
              <p className="pchat-vide">Aucun message. Lance la conversation.</p>
            ) : (
              messages.map((m, i) => {
                const prec = messages[i - 1];
                const nouveauJour =
                  !prec || jour(prec.envoyeLe) !== jour(m.envoyeLe);
                const memeAuteur =
                  prec && prec.auteur.id === m.auteur.id && !nouveauJour;
                const mien = m.auteur.id === moiId;
                return (
                  <div key={m.id}>
                    {nouveauJour && (
                      <div className="pchat-jour">{jour(m.envoyeLe)}</div>
                    )}
                    <div
                      className={`pchat-msg${mien ? ' pchat-msg--mien' : ''}`}
                    >
                      {!memeAuteur && !mien && (
                        <span className="pchat-msg-auteur">{m.auteur.nom}</span>
                      )}
                      <span className="pchat-msg-bulle">
                        {m.texte}
                        <span className="pchat-msg-heure">{heure(m.envoyeLe)}</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {!ecriture ? (
            <p className="pchat-saisie pchat-saisie--lecture">Lecture seule</p>
          ) : (
            <form
              className="pchat-saisie"
              onSubmit={(e) => {
                e.preventDefault();
                envoyer();
              }}
            >
              <textarea
                className="pchat-saisie-champ"
                rows={1}
                placeholder="Message…"
                value={brouillon}
                maxLength={4000}
                onChange={(e) => setBrouillon(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    envoyer();
                  }
                }}
              />
              <button
                type="submit"
                className="pchat-saisie-btn"
                disabled={!brouillon.trim() || envoiEnCours}
                aria-label="Envoyer"
              >
                <SendHorizonal size={17} aria-hidden />
              </button>
            </form>
          )}
        </>
      )}
      {fiche && <FicheContactModal slug={slug} utilisateurId={fiche} onClose={() => setFiche(null)} />}
    </div>
  );
}
