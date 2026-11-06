'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';
import {
  connecterFluxChat,
  creerGroupe,
  type EnvoiMessage,
  envoyerMessage,
  getAnnuaireChat,
  getCanaux,
  getLectures,
  getMessages,
  marquerCanalLu,
  ouvrirDirect,
  surOuvrirConversation,
} from '@/lib/chat';
import type { CanalChat, EtatFluxChat, EvenementChat, LectureChat, MembreAnnuaire, MessageChat } from '@/lib/types';
import { PanneauChat, type VueChat } from '@/components/chat/panneau-chat';
import { jouerSonNotification } from '@/lib/notification-sound';
import { sonPermis } from '@/lib/preferences-notifications';

// « En train d'écrire » : affiché 5 s après le dernier signal.
const FRAPPE_MS = 5_000;

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
  // Messagerie, suite (02/11/2026) : qui écrit, jusqu'où chacun a lu, message
  // à montrer (résultat de recherche).
  const [frappes, setFrappes] = useState<Record<string, { nom: string; jusqua: number }>>({});
  const [lectures, setLectures] = useState<LectureChat[]>([]);
  const [messageCible, setMessageCible] = useState<string | null>(null);

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

    const actifIci = e.canalId === canalActifIdRef.current;
    if (e.type === 'message_modifie') {
      if (actifIci) setMessages((ms) => ms.map((m) => (m.id === e.message.id ? e.message : m)));
      return;
    }
    if (e.type === 'reactions') {
      if (actifIci) setMessages((ms) => ms.map((m) => (m.id === e.messageId ? { ...m, reactions: e.reactions } : m)));
      return;
    }
    if (e.type === 'frappe') {
      setFrappes((f) => ({
        ...f,
        [`${e.canalId}:${e.utilisateurId}`]: { nom: e.nom, jusqua: Date.now() + FRAPPE_MS },
      }));
      setTimeout(() => setFrappes((f) => ({ ...f })), FRAPPE_MS + 50);
      return;
    }
    if (e.type === 'lecture') {
      if (actifIci) {
        setLectures((l) => [
          ...l.filter((x) => x.utilisateurId !== e.utilisateurId),
          { utilisateurId: e.utilisateurId, nom: e.nom, luLe: e.luLe },
        ]);
      }
      return;
    }

    const { canalId, message } = e;
    // Il a envoyé : il n'écrit plus.
    setFrappes((f) => {
      const n = { ...f };
      delete n[`${canalId}:${message.auteur.id}`];
      return n;
    });
    if (!canauxRef.current.some((c) => c.id === canalId)) {
      rafraichirCanaux(); // nouveau canal (DM ouvert par l'autre)
      return;
    }
    const actif = canalId === canalActifIdRef.current && ouvertRef.current;
    const mien = message.auteur.id === moiId;
    // Jamais pour son propre message renvoyé par le flux SSE — seulement à
    // la réception d'un message de quelqu'un d'autre (décision boss, sept. 2026).
    if (!mien && !message.systeme && sonPermis('messagerie')) jouerSonNotification();

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

  // Ouvre une conversation (et, s'il est donné, y montre un message).
  function ouvrirSur(id: string, messageId?: string) {
    setOuvert(true);
    getCanaux(slug)
      .then((liste) => {
        setCanaux(liste);
        if (liste.some((c) => c.id === id)) choisirCanal(id, messageId);
      })
      .catch(() => {});
  }

  // Clic sur une notification de mention ou de groupe, ou sur une notification
  // système (?conversation= dans l'adresse) : la conversation s'ouvre.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demandee = params.get('conversation');
    if (demandee) {
      params.delete('conversation');
      const reste = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${reste ? `?${reste}` : ''}`);
      ouvrirSur(demandee);
    }
    return surOuvrirConversation((id) => ouvrirSur(id));
    // ouvrirSur ne dépend que de setState stables et du slug
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

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

  function choisirCanal(id: string, messageId?: string) {
    setVue('liste');
    setCanalActifId(id);
    setMessages([]);
    setCurseur(null);
    setLectures([]);
    setMessageCible(messageId ?? null);
    setChargement(true);
    getLectures(slug, id)
      .then(setLectures)
      .catch(() => {});
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

  // Renvoie false si l'envoi a échoué : la saisie garde le brouillon.
  async function envoyer(envoi: EnvoiMessage): Promise<boolean> {
    if (!canalActifId || envoiEnCours) return false;
    setEnvoiEnCours(true);
    try {
      const m = await envoyerMessage(slug, canalActifId, envoi);
      setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m]));
      setCanaux((cs) => trier(cs.map((c) => (c.id === canalActifId ? { ...c, dernierMessageLe: m.envoyeLe } : c))));
      return true;
    } catch {
      return false;
    } finally {
      setEnvoiEnCours(false);
    }
  }

  const total = canaux.reduce((s, c) => s + c.nonLus, 0);
  const canalActif = canaux.find((c) => c.id === canalActifId) ?? null;
  const maintenant = Date.now();
  const ecrivent = Object.entries(frappes)
    .filter(([cle, f]) => canalActifId && cle.startsWith(`${canalActifId}:`) && f.jusqua > maintenant)
    .map(([, f]) => f.nom);

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
            ecrivent={ecrivent}
            lectures={lectures}
            messageCible={messageCible}
            onMessageMaj={(m) => setMessages((ms) => ms.map((x) => (x.id === m.id ? m : x)))}
            onOuvrirResultat={(canalId, messageId) => choisirCanal(canalId, messageId)}
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
