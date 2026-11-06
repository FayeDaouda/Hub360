'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { FileText, Paperclip, Pencil, Reply, SendHorizonal, X } from 'lucide-react';
import { stripAccents } from '@hub/domain';
import { type EnvoiMessage, getMentionnables, modifierMessage, signalerFrappe } from '@/lib/chat';
import { FICHIERS_ACCEPTES, lireFichier } from '@/lib/fichiers';
import type { CanalChat, MessageChat, PersonneChat } from '@/lib/types';
import { PersonAvatar } from '@/components/ui/avatar';

// Saisie d'un message (01/11/2026, enrichie le 02/11/2026) : mentions (« @ »
// propose les lecteurs de la conversation, « @tous » hors Général), pièces
// jointes (bouton, coller une image, glisser-déposer — 4 au plus, 8 Mo
// chacune), réponse à un message, modification de son message. Signale « en
// train d'écrire » aux autres (3 s entre deux signaux). Une saisie par
// conversation (key = canal).
const normaliser = (x: string) => stripAccents(x).toLowerCase();
// « @mot » en cours de frappe juste avant le curseur.
const JETON = /(^|\s)@([^\s@]{0,30})$/u;
const TOUS: PersonneChat = { id: '__tous__', nom: 'tous', photoUrl: null };
const PIECES_MAX = 4;
const PIECE_MAX_OCTETS = 8 * 1024 * 1024;
const FRAPPE_TOUTES_MS = 3_000;
type PieceJointe = { nom: string; url: string; taille: number };

export function SaisieChat({
  slug,
  canal,
  moiId,
  envoiEnCours,
  reponse,
  edition,
  onAnnulerReponse,
  onAnnulerEdition,
  onEditionFaite,
  onEnvoyer,
}: {
  slug: string;
  canal: CanalChat;
  moiId: string;
  envoiEnCours: boolean;
  reponse: MessageChat | null;
  edition: MessageChat | null;
  onAnnulerReponse: () => void;
  onAnnulerEdition: () => void;
  onEditionFaite: (m: MessageChat) => void;
  onEnvoyer: (envoi: EnvoiMessage) => Promise<boolean>;
}) {
  const [brouillon, setBrouillon] = useState(edition?.texte ?? '');
  const [personnes, setPersonnes] = useState<PersonneChat[]>([]);
  const [mentions, setMentions] = useState<PersonneChat[]>(
    edition?.mentions?.map((m) => ({ ...m, photoUrl: null })) ?? [],
  );
  const [recherche, setRecherche] = useState<string | null>(null);
  const [choix, setChoix] = useState(0);
  const [pieces, setPieces] = useState<PieceJointe[]>([]);
  const [survol, setSurvol] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const entree = useRef<HTMLInputElement>(null);
  const derniereFrappe = useRef(0);
  // Curseur à poser après l'insertion d'une mention (avant toute autre frappe).
  const curseurApres = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = champ.current;
    if (el && curseurApres.current !== null) {
      el.focus();
      el.setSelectionRange(curseurApres.current, curseurApres.current);
      curseurApres.current = null;
    }
  }, [brouillon]);
  // Hauteur du champ selon son texte (5 lignes au plus).
  useLayoutEffect(() => {
    const el = champ.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [brouillon]);
  // Répondre ou modifier : le champ prend la main.
  useEffect(() => {
    if (reponse || edition) champ.current?.focus();
  }, [reponse, edition]);

  useEffect(() => {
    getMentionnables(slug, canal.id)
      .then((l) => setPersonnes(l.filter((p) => p.id !== moiId)))
      .catch(() => setPersonnes([]));
  }, [slug, canal.id, moiId]);

  const candidats = canal.type === 'general' ? personnes : [TOUS, ...personnes];
  const propositions =
    recherche === null ? [] : candidats.filter((p) => normaliser(p.nom).includes(normaliser(recherche))).slice(0, 6);

  function surFrappe(valeur: string, curseur: number) {
    setBrouillon(valeur);
    const m = JETON.exec(valeur.slice(0, curseur));
    setRecherche(m ? m[2] : null);
    setChoix(0);
    if (valeur.trim() && Date.now() - derniereFrappe.current > FRAPPE_TOUTES_MS) {
      derniereFrappe.current = Date.now();
      signalerFrappe(slug, canal.id).catch(() => {});
    }
  }

  function choisir(p: PersonneChat) {
    const el = champ.current;
    const curseur = el?.selectionStart ?? brouillon.length;
    const avant = brouillon.slice(0, curseur).replace(JETON, (_t, espace: string) => `${espace}@${p.nom} `);
    setBrouillon(avant + brouillon.slice(curseur));
    if (p.id !== TOUS.id) setMentions((l) => (l.some((x) => x.id === p.id) ? l : [...l, p]));
    setRecherche(null);
    curseurApres.current = avant.length;
  }

  async function ajouterFichiers(fichiers: File[]) {
    setErreur(null);
    const place = PIECES_MAX - pieces.length;
    if (!edition && fichiers.length > place) setErreur(`${PIECES_MAX} pièces au plus par message.`);
    for (const f of fichiers.slice(0, Math.max(0, place))) {
      if (f.size > PIECE_MAX_OCTETS) {
        setErreur(`« ${f.name} » dépasse 8 Mo.`);
        continue;
      }
      try {
        const lu = await lireFichier(f);
        setPieces((l) => [...l, { nom: lu.nom, url: lu.url, taille: lu.taille }]);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Lecture du fichier impossible.');
      }
    }
  }

  async function envoyer() {
    const t = brouillon.trim();
    if ((!t && !pieces.length) || envoiEnCours) return;
    setErreur(null);
    if (edition) {
      try {
        onEditionFaite(await modifierMessage(slug, canal.id, edition.id, t));
        setBrouillon('');
      } catch {
        setErreur('Modification impossible : les 15 minutes sont passées.');
      }
      return;
    }
    // Mentions encore présentes dans le texte (une mention effacée ne prévient personne).
    const ids = mentions.filter((p) => t.includes(`@${p.nom}`)).map((p) => p.id);
    const ok = await onEnvoyer({
      texte: t,
      mentionIds: ids,
      mentionTous: canal.type !== 'general' && /(^|\s)@tous\b/.test(t),
      reponseAId: reponse?.id,
      pieces: pieces.map(({ nom, url }) => ({ nom, url })),
    });
    if (!ok) {
      setErreur('Le message n’est pas parti. Vérifiez la connexion puis réessayez.');
      return;
    }
    setBrouillon('');
    setMentions([]);
    setPieces([]);
    setRecherche(null);
    onAnnulerReponse();
  }

  function surTouche(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (propositions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setChoix((c) => (c + (e.key === 'ArrowDown' ? 1 : propositions.length - 1)) % propositions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choisir(propositions[choix]);
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        setRecherche(null);
        return;
      }
    }
    if (e.key === 'Escape' && (edition || reponse)) {
      e.stopPropagation();
      if (edition) onAnnulerEdition();
      else onAnnulerReponse();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void envoyer();
    }
  }

  function surCollage(e: ClipboardEvent<HTMLTextAreaElement>) {
    const fichiers = [...e.clipboardData.files];
    if (fichiers.length && !edition) {
      e.preventDefault();
      void ajouterFichiers(fichiers);
    }
  }

  function surDepot(e: DragEvent) {
    e.preventDefault();
    setSurvol(false);
    if (!edition) void ajouterFichiers([...e.dataTransfer.files]);
  }

  return (
    <form
      className={`pchat-saisie-bloc${survol ? ' is-survol' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        void envoyer();
      }}
      onDragOver={(e) => {
        if (edition) return;
        e.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={surDepot}
    >
      {(reponse || edition) && (
        <div className="pchat-contexte">
          {edition ? <Pencil size={14} aria-hidden /> : <Reply size={14} aria-hidden />}
          <span>
            <strong>{edition ? 'Modifier le message' : `Répondre à ${reponse!.auteur.nom}`}</strong>
            <span>{(edition ?? reponse)!.texte || '📎 Pièce jointe'}</span>
          </span>
          <button
            type="button"
            aria-label="Annuler"
            onClick={() => {
              if (edition) {
                setBrouillon('');
                onAnnulerEdition();
              } else onAnnulerReponse();
            }}
          >
            <X size={15} aria-hidden />
          </button>
        </div>
      )}
      {pieces.length > 0 && (
        <ul className="pchat-jointes">
          {pieces.map((p, i) => (
            <li key={`${p.nom}-${i}`}>
              {p.url.startsWith('data:image/') ? <img src={p.url} alt="" /> : <FileText size={16} aria-hidden />}
              <span>{p.nom}</span>
              <button
                type="button"
                aria-label={`Retirer ${p.nom}`}
                onClick={() => setPieces((l) => l.filter((_, j) => j !== i))}
              >
                <X size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {erreur && <p className="pchat-erreur pchat-saisie-erreur">{erreur}</p>}
      <div className="pchat-saisie">
        {propositions.length > 0 && (
          <ul className="pchat-mentions" role="listbox" aria-label="Mentionner">
            {propositions.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === choix}>
                <button
                  type="button"
                  className={i === choix ? 'is-actif' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choisir(p);
                  }}
                >
                  {p.id === TOUS.id ? (
                    <span className="pchat-mention-tous" aria-hidden>
                      @
                    </span>
                  ) : (
                    <PersonAvatar name={p.nom} photo={p.photoUrl} colorKey={p.id} size="sm" />
                  )}
                  {p.id === TOUS.id ? (
                    <span>
                      tous <span className="pchat-annuaire-role">prévenir toute la conversation</span>
                    </span>
                  ) : (
                    p.nom
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!edition && (
          <>
            <button
              type="button"
              className="pchat-joindre"
              aria-label="Joindre un fichier"
              title="Joindre une photo ou un document"
              disabled={pieces.length >= PIECES_MAX}
              onClick={() => entree.current?.click()}
            >
              <Paperclip size={17} aria-hidden />
            </button>
            <input
              ref={entree}
              type="file"
              multiple
              hidden
              accept={FICHIERS_ACCEPTES.projet}
              onChange={(e) => {
                void ajouterFichiers([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </>
        )}
        <textarea
          ref={champ}
          className="pchat-saisie-champ"
          rows={1}
          placeholder={
            canal.type === 'general' ? 'Message… (@ pour mentionner)' : 'Message… (@ pour mentionner, @tous)'
          }
          value={brouillon}
          maxLength={4000}
          aria-label="Message"
          onChange={(e) => surFrappe(e.target.value, e.target.selectionStart)}
          onKeyDown={surTouche}
          onPaste={surCollage}
        />
        <button
          type="submit"
          className="pchat-saisie-btn"
          disabled={(!brouillon.trim() && !pieces.length) || envoiEnCours}
          aria-label={edition ? 'Enregistrer la modification' : 'Envoyer'}
        >
          <SendHorizonal size={17} aria-hidden />
        </button>
      </div>
    </form>
  );
}

// Texte d'un message, mentions surlignées (la sienne davantage).
export function TexteMessage({
  texte,
  mentions,
  moiId,
}: {
  texte: string;
  mentions: { id: string; nom: string }[];
  moiId: string;
}) {
  const echappe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // « @tous » se surligne aussi (01/11/2026).
  const jetons = [...mentions.map((m) => `@${echappe(m.nom)}`), '@tous'];
  if (!mentions.length && !texte.includes('@tous')) return <>{texte}</>;
  const motif = new RegExp(`(${jetons.join('|')})`, 'g');
  return (
    <>
      {texte.split(motif).map((morceau, i) => {
        const m = mentions.find((x) => `@${x.nom}` === morceau);
        return m || morceau === '@tous' ? (
          <span key={i} className={`pchat-mention${m?.id === moiId ? ' is-moi' : ''}`}>
            {morceau}
          </span>
        ) : (
          morceau
        );
      })}
    </>
  );
}
