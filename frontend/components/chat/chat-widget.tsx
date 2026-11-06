'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';
import {
  connecterFluxChat,
  creerGroupe,
  envoyerMessage,
  getAnnuaireChat,
  getCanaux,
  getMessages,
  marquerCanalLu,
  ouvrirDirect,
  surOuvrirConversation,
} from '@/lib/chat';
import type { CanalChat, EtatFluxChat, EvenementChat, MembreAnnuaire, MessageChat } from '@/lib/types';
import { PanneauChat, type VueChat } from '@/components/chat/panneau-chat';
import { jouerSonNotification } from '@/lib/notification-sound';

// Orchestrateur du chat, monté dans la topbar (collaborateur ET admin) : garde
// une connexion SSE ouverte tant qu'on est dans l'app (le badge de non-lus vit
// même panneau fermé), possède la liste des canaux et les messages du canal
// ouvert. `GET /canaux` distingue déjà admin (Général + 6 cellules + DM) de
// collaborateur (Général + sa cellule + DM) — rien de spécifique ici. Le
// panneau lui-même est purement présentiel.
export function ChatWidget({ slug, moiId, ecriture = true }: { slug: string; moiId: string; ecriture?: boolean }) {
  const [canaux, setCanaux] = useState<CanalChat[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [etatFlux, setEtatFlux] = useState<EtatFluxChat>('connexion');
  const [canalActifId, setCanalActifId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageChat[]>([]);
  const [curseur, setCurseur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [vue, setVue] = useState<VueChat>('liste');
  const [annuaire, setAnnuaire] = useState<MembreAnnuaire[] | null>(null);

  // Refs pour lire l'état courant depuis le callback du flux (closure figée).
  const canalActifIdRef = useRef<string | null>(null);
  canalActifIdRef.current = canalActifId;
  const ouvertRef = useRef(false);
  ouvertRef.current = ouvert;
  const canauxRef = useRef<CanalChat[]>([]);
  canauxRef.current = canaux;

  const rafraichirCanaux = useCallback(() => {
    getCanaux(slug)
      .then(setCanaux)
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    rafraichirCanaux();
    const fermer = connecterFluxChat({
      slug,
      onEtat: setEtatFlux,
      onEvenement: appliquer,
    });
    return fermer;
    // appliquer ne dépend que de refs + setState stables
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, rafraichirCanaux]);

  function appliquer(e: EvenementChat) {
    if (e.type === 'non_lus') {
      setCanaux((cs) => cs.map((c) => (c.id === e.canalId ? { ...c, nonLus: e.nonLus } : c)));
      return;
    }

    const { canalId, message } = e;
    if (!canauxRef.current.some((c) => c.id === canalId)) {
      rafraichirCanaux(); // nouveau canal (DM ouvert par l'autre)
      return;
    }
    const actif = canalId === canalActifIdRef.current && ouvertRef.current;
    const mien = message.auteur.id === moiId;
    // Jamais pour son propre message renvoyé par le flux SSE — seulement à
    // la réception d'un message de quelqu'un d'autre (décision boss, sept. 2026).
    if (!mien) jouerSonNotification();

    setCanaux((cs) =>
      trier(
        cs.map((c) =>
          c.id === canalId
            ? {
                ...c,
                dernierMessageLe: message.envoyeLe,
                nonLus: actif || mien ? c.nonLus : c.nonLus + 1,
              }
            : c,
        ),
      ),
    );

    if (actif) {
      setMessages((ms) => (ms.some((m) => m.id === message.id) ? ms : [...ms, message]));
      if (!mien) marquerCanalLu(slug, canalId).catch(() => {});
    }
  }

  function chargerAnnuaire() {
    setAnnuaire(null);
    getAnnuaireChat(slug)
      .then(setAnnuaire)
      .catch(() => setAnnuaire([]));
  }
  function ouvrirAnnuaire() {
    setVue('annuaire');
    chargerAnnuaire();
  }

  // Clic sur une notification de mention ou de groupe : la conversation s'ouvre.
  useEffect(
    () =>
      surOuvrirConversation((id) => {
        setOuvert(true);
        getCanaux(slug)
          .then((liste) => {
            setCanaux(liste);
            if (liste.some((c) => c.id === id)) choisirCanal(id);
          })
          .catch(() => {});
      }),
    // choisirCanal ne dépend que de setState stables et du slug
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug],
  );

  async function nouveauGroupe(nom: string, membreIds: string[]) {
    const canal = await creerGroupe(slug, nom, membreIds);
    setCanaux(await getCanaux(slug));
    choisirCanal(canal.id);
  }

  async function nouveauDm(utilisateurId: string) {
    try {
      const canal = await ouvrirDirect(slug, utilisateurId);
      const liste = await getCanaux(slug);
      setCanaux(liste);
      choisirCanal(canal.id);
    } catch {
      /* échec silencieux — l'annuaire reste ouvert */
    }
  }

  function choisirCanal(id: string) {
    setVue('liste');
    setCanalActifId(id);
    setMessages([]);
    setCurseur(null);
    setChargement(true);
    getMessages(slug, id)
      .then((p) => {
        setMessages(p.messages);
        setCurseur(p.curseurSuivant);
      })
      .catch(() => {})
      .finally(() => setChargement(false));
    marquerCanalLu(slug, id).catch(() => {});
    setCanaux((cs) => cs.map((c) => (c.id === id ? { ...c, nonLus: 0 } : c)));
  }

  function chargerPlus() {
    if (!canalActifId || !curseur || chargement) return;
    setChargement(true);
    getMessages(slug, canalActifId, curseur)
      .then((p) => {
        setMessages((ms) => [...p.messages, ...ms]);
        setCurseur(p.curseurSuivant);
      })
      .catch(() => {})
      .finally(() => setChargement(false));
  }

  async function envoyer(texte: string, mentionIds: string[]) {
    if (!canalActifId || envoiEnCours) return;
    setEnvoiEnCours(true);
    try {
      const m = await envoyerMessage(slug, canalActifId, texte, mentionIds);
      setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m]));
      setCanaux((cs) => trier(cs.map((c) => (c.id === canalActifId ? { ...c, dernierMessageLe: m.envoyeLe } : c))));
    } catch {
      /* l'erreur réseau laisse le brouillon perdu — acceptable v1 */
    } finally {
      setEnvoiEnCours(false);
    }
  }

  const total = canaux.reduce((s, c) => s + c.nonLus, 0);
  const canalActif = canaux.find((c) => c.id === canalActifId) ?? null;

  return (
    <>
      <button
        type="button"
        className="admin-cloche"
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-label={total > 0 ? `Messages, ${total} non lus` : 'Messages'}
        title="Messages"
        onClick={() => {
          const prochain = !ouvert;
          setOuvert(prochain);
          if (prochain) {
            rafraichirCanaux();
            // Recharge le fil ouvert : des messages ont pu arriver panneau fermé.
            if (canalActifId) choisirCanal(canalActifId);
          }
        }}
      >
        <MessageSquare size={17} aria-hidden />
        {total > 0 && <span className="admin-cloche-badge">{total}</span>}
      </button>

      {/* Portail : la barre du haut (backdrop-filter) enfermerait le panneau
          sous la barre de navigation du téléphone. */}
      {ouvert &&
        createPortal(
          <PanneauChat
            slug={slug}
            moiId={moiId}
            ecriture={ecriture}
            etatFlux={etatFlux}
            canaux={canaux}
            canalActif={canalActif}
            messages={messages}
            curseur={curseur}
            chargement={chargement}
            envoiEnCours={envoiEnCours}
            vue={vue}
            annuaire={annuaire}
            onFermer={() => setOuvert(false)}
            onChoisirCanal={choisirCanal}
            onRetourListe={() => {
              setVue('liste');
              setCanalActifId(null);
            }}
            onChargerPlus={chargerPlus}
            onEnvoyer={envoyer}
            onOuvrirAnnuaire={ouvrirAnnuaire}
            onNouveauDm={nouveauDm}
            onVue={setVue}
            onCreerGroupe={nouveauGroupe}
            onGroupeQuitte={() => {
              setVue('liste');
              setCanalActifId(null);
              rafraichirCanaux();
            }}
            onCanauxMaj={rafraichirCanaux}
            onOuvrirAnnuaireSansVue={chargerAnnuaire}
          />,
          document.body,
        )}
    </>
  );
}

function trier(cs: CanalChat[]): CanalChat[] {
  return [...cs].sort(
    (a, b) =>
      Number(b.nonLus > 0) - Number(a.nonLus > 0) ||
      (b.dernierMessageLe ? Date.parse(b.dernierMessageLe) : 0) -
        (a.dernierMessageLe ? Date.parse(a.dernierMessageLe) : 0),
  );
}
