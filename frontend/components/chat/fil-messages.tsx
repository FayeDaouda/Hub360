'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCheck, FileText, Pencil, Reply, SmilePlus, Trash2, X } from 'lucide-react';
import { addDays, formatDayLongMonth, formatTime, todayIso, toIsoDay } from '@hub/domain';
import { DELAI_MODIFICATION_MS, EMOJIS, getPieceMessage, reagir, supprimerMessage } from '@/lib/chat';
import { telechargerFichier } from '@/lib/fichiers';
import type { LectureChat, MessageChat, PieceMessageChat } from '@/lib/types';
import { useConfirmer } from '@/components/confirmation';
import { TexteMessage } from './saisie-chat';

// Fil d'une conversation (02/11/2026) : messages, réponses citées, pièces
// jointes (aperçu des images), réactions, « modifié », « vu par ». Au survol
// (ou d'un toucher sur téléphone), les actions du message : répondre, réagir,
// et pour son auteur pendant 15 min, modifier ou supprimer.

const heure = formatTime;
function jour(iso: string): string {
  const d = toIsoDay(new Date(iso));
  const auj = todayIso();
  if (d === auj) return "Aujourd'hui";
  if (d === addDays(auj, -1)) return 'Hier';
  return formatDayLongMonth(iso);
}
const taille = (o: number) =>
  o >= 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`;

// Contenu des pièces déjà téléchargées (aperçus des images), gardé pour la session.
const cachePieces = new Map<string, Promise<{ nom: string; url: string; type: string }>>();
function chargerPiece(slug: string, canalId: string, messageId: string, pieceId: string) {
  let p = cachePieces.get(pieceId);
  if (!p) {
    p = getPieceMessage(slug, canalId, messageId, pieceId);
    p.catch(() => cachePieces.delete(pieceId));
    cachePieces.set(pieceId, p);
  }
  return p;
}

export function FilMessages({
  slug,
  canalId,
  moiId,
  messages,
  lectures,
  messageCible,
  ecriture,
  onRepondre,
  onModifier,
  onMessageMaj,
}: {
  slug: string;
  canalId: string;
  moiId: string;
  messages: MessageChat[];
  lectures: LectureChat[];
  messageCible: string | null;
  ecriture: boolean;
  onRepondre: (m: MessageChat) => void;
  onModifier: (m: MessageChat) => void;
  onMessageMaj: (m: MessageChat) => void;
}) {
  const [actionsSur, setActionsSur] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ nom: string; url: string } | null>(null);
  const confirmer = useConfirmer();

  // Résultat de recherche : le message est amené à l'écran et souligné.
  useEffect(() => {
    if (!messageCible) return;
    document.getElementById(`msg-${messageCible}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [messageCible, messages.length]);

  // « Vu par » : sous son dernier message, qui l'a lu depuis.
  const dernierMien = [...messages].reverse().find((m) => m.auteur.id === moiId && !m.systeme && !m.supprime);
  const vuPar = dernierMien
    ? lectures.filter((l) => l.utilisateurId !== moiId && Date.parse(l.luLe) >= Date.parse(dernierMien.envoyeLe))
    : [];

  async function supprimer(m: MessageChat) {
    const ok = await confirmer({
      titre: 'Supprimer ce message ?',
      message: 'Il disparaît pour tout le monde ; la conversation garde « Message supprimé ».',
      confirmer: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      onMessageMaj(await supprimerMessage(slug, canalId, m.id));
    } catch {
      /* délai dépassé entre-temps : le message reste */
    }
  }

  async function basculerReaction(m: MessageChat, emoji: string) {
    setActionsSur(null);
    try {
      onMessageMaj({ ...m, reactions: await reagir(slug, canalId, m.id, emoji) });
    } catch {
      /* rien : l'état réel revient par le flux */
    }
  }

  return (
    <>
      {messages.map((m, i) => {
        const prec = messages[i - 1];
        const nouveauJour = !prec || jour(prec.envoyeLe) !== jour(m.envoyeLe);
        const memeAuteur = prec && prec.auteur.id === m.auteur.id && !nouveauJour && !prec.systeme;
        const mien = m.auteur.id === moiId;
        const mentionne = !mien && !!m.mentions?.some((x) => x.id === moiId);
        const modifiable = mien && !m.supprime && Date.now() - Date.parse(m.envoyeLe) < DELAI_MODIFICATION_MS;
        const classes = [
          'pchat-msg',
          mien && 'pchat-msg--mien',
          mentionne && 'pchat-msg--mentionne',
          m.id === messageCible && 'pchat-msg--cible',
          actionsSur === m.id && 'is-actions',
        ].filter(Boolean);
        return (
          <div key={m.id} id={`msg-${m.id}`}>
            {nouveauJour && <div className="pchat-jour">{jour(m.envoyeLe)}</div>}
            {m.systeme ? (
              <div className="pchat-systeme">
                {m.texte} · {heure(m.envoyeLe)}
              </div>
            ) : (
              <div className={classes.join(' ')}>
                {!memeAuteur && !mien && <span className="pchat-msg-auteur">{m.auteur.nom}</span>}
                <div className="pchat-msg-ligne">
                  <div
                    className={`pchat-msg-bulle${m.supprime ? ' is-supprime' : ''}`}
                    onClick={() => setActionsSur((x) => (x === m.id ? null : m.id))}
                  >
                    {m.reponseA && (
                      <button
                        type="button"
                        className="pchat-citation"
                        onClick={(e) => {
                          e.stopPropagation();
                          document
                            .getElementById(`msg-${m.reponseA!.id}`)
                            ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        }}
                      >
                        <strong>{m.reponseA.auteur}</strong>
                        <span>{m.reponseA.extrait}</span>
                      </button>
                    )}
                    {m.supprime ? (
                      <em>Message supprimé</em>
                    ) : (
                      <>
                        {m.pieces?.length ? (
                          <div className="pchat-pieces">
                            {m.pieces.map((p) => (
                              <Piece
                                key={p.id}
                                slug={slug}
                                canalId={canalId}
                                messageId={m.id}
                                piece={p}
                                onApercu={setApercu}
                              />
                            ))}
                          </div>
                        ) : null}
                        {m.texte && <TexteMessage texte={m.texte} mentions={m.mentions ?? []} moiId={moiId} />}
                      </>
                    )}
                    <span className="pchat-msg-heure">
                      {m.modifieLe && !m.supprime && 'modifié · '}
                      {heure(m.envoyeLe)}
                    </span>
                  </div>
                  {ecriture && !m.supprime && (
                    <div className="pchat-actions" role="toolbar" aria-label="Actions du message">
                      <button type="button" aria-label="Répondre" title="Répondre" onClick={() => onRepondre(m)}>
                        <Reply size={14} aria-hidden />
                      </button>
                      <span className="pchat-actions-emojis">
                        <SmilePlus size={14} aria-hidden className="pchat-actions-icone" />
                        {EMOJIS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            aria-label={`Réagir ${e}`}
                            onClick={() => void basculerReaction(m, e)}
                          >
                            {e}
                          </button>
                        ))}
                      </span>
                      {modifiable && (
                        <>
                          <button type="button" aria-label="Modifier" title="Modifier" onClick={() => onModifier(m)}>
                            <Pencil size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label="Supprimer"
                            title="Supprimer"
                            className="pchat-actions-danger"
                            onClick={() => void supprimer(m)}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {!!m.reactions?.length && (
                  <div className="pchat-reactions">
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        className={r.ids.includes(moiId) ? 'is-moi' : ''}
                        title={r.noms.join(', ')}
                        disabled={!ecriture}
                        onClick={() => void basculerReaction(m, r.emoji)}
                      >
                        {r.emoji} {r.ids.length}
                      </button>
                    ))}
                  </div>
                )}
                {m.id === dernierMien?.id && vuPar.length > 0 && (
                  <span className="pchat-vu" title={vuPar.map((l) => l.nom).join(', ')}>
                    <CheckCheck size={13} aria-hidden /> Vu par{' '}
                    {vuPar.length <= 3
                      ? vuPar.map((l) => l.nom.split(' ')[0]).join(', ')
                      : `${vuPar
                          .slice(0, 2)
                          .map((l) => l.nom.split(' ')[0])
                          .join(', ')} et ${vuPar.length - 2} autres`}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {apercu && <Apercu image={apercu} onFermer={() => setApercu(null)} />}
    </>
  );
}

// Pièce jointe : aperçu pour une image (chargée à l'écran), puce sinon.
function Piece({
  slug,
  canalId,
  messageId,
  piece,
  onApercu,
}: {
  slug: string;
  canalId: string;
  messageId: string;
  piece: PieceMessageChat;
  onApercu: (p: { nom: string; url: string }) => void;
}) {
  const image = piece.type.startsWith('image/');
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!image || !ref.current) return;
    const obs = new IntersectionObserver((entrees) => {
      if (entrees.some((e) => e.isIntersecting)) {
        obs.disconnect();
        chargerPiece(slug, canalId, messageId, piece.id)
          .then((p) => setUrl(p.url))
          .catch(() => {});
      }
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [image, slug, canalId, messageId, piece.id]);

  async function ouvrir() {
    try {
      const p = await chargerPiece(slug, canalId, messageId, piece.id);
      if (image) onApercu({ nom: p.nom, url: p.url });
      else telechargerFichier(p);
    } catch {
      /* indisponible */
    }
  }

  return image ? (
    <button
      ref={ref}
      type="button"
      className="pchat-piece-image"
      aria-label={`Voir ${piece.nom}`}
      onClick={(e) => {
        e.stopPropagation();
        void ouvrir();
      }}
    >
      {url ? <img src={url} alt={piece.nom} /> : <span className="pchat-piece-attente skeleton" aria-hidden />}
    </button>
  ) : (
    <button
      type="button"
      className="pchat-piece-fichier"
      onClick={(e) => {
        e.stopPropagation();
        void ouvrir();
      }}
    >
      <FileText size={18} aria-hidden />
      <span>
        <strong>{piece.nom}</strong>
        <span>{taille(piece.taille)} · télécharger</span>
      </span>
    </button>
  );
}

// Image en grand, par-dessus le panneau.
function Apercu({ image, onFermer }: { image: { nom: string; url: string }; onFermer: () => void }) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onFermer();
      }
    };
    window.addEventListener('keydown', touche, true);
    return () => window.removeEventListener('keydown', touche, true);
  }, [onFermer]);
  return (
    <div className="pchat-apercu" role="dialog" aria-label={image.nom} onClick={onFermer}>
      <button type="button" className="pchat-apercu-fermer" aria-label="Fermer" onClick={onFermer}>
        <X size={20} aria-hidden />
      </button>
      <img src={image.url} alt={image.nom} onClick={(e) => e.stopPropagation()} />
      <button
        type="button"
        className="btn-ghost btn-ghost--sm pchat-apercu-telecharger"
        onClick={(e) => {
          e.stopPropagation();
          telechargerFichier(image);
        }}
      >
        Télécharger
      </button>
    </div>
  );
}
