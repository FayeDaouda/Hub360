'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Briefcase, ChevronLeft, Info, Plus, Search, UsersRound, X } from 'lucide-react';
import { FicheContactModal } from '@/components/contacts/fiche-contact';
import type { EnvoiMessage } from '@/lib/chat';
import type { CanalChat, EtatFluxChat, LectureChat, MembreAnnuaire, MessageChat } from '@/lib/types';
import { PersonAvatar } from '@/components/ui/avatar';
import { InfosGroupe, NouveauGroupe } from './groupe-chat';
import { FilMessages } from './fil-messages';
import { RechercheChat } from './recherche-chat';
import { SaisieChat } from './saisie-chat';

// Vue du panneau : liste, nouvelle conversation (annuaire), nouveau groupe,
// fiche du groupe ouvert (01/11/2026).
export type VueChat = 'liste' | 'annuaire' | 'nouveau-groupe' | 'infos';
import { formatTime } from '@hub/domain';

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
  vue: VueChat;
  annuaire: MembreAnnuaire[] | null;
  onFermer: () => void;
  onChoisirCanal: (id: string) => void;
  onRetourListe: () => void;
  onChargerPlus: () => void;
  onEnvoyer: (envoi: EnvoiMessage) => Promise<boolean>;
  onOuvrirAnnuaire: () => void;
  onNouveauDm: (utilisateurId: string) => void;
  onVue: (v: VueChat) => void;
  onCreerGroupe: (nom: string, membreIds: string[]) => Promise<void>;
  onGroupeQuitte: () => void;
  onCanauxMaj: () => void;
  // Charge l'annuaire sans changer de vue (ajout de membres au groupe).
  onOuvrirAnnuaireSansVue: () => void;
  // Messagerie, suite (02/11/2026).
  ecrivent: string[];
  lectures: LectureChat[];
  messageCible: string | null;
  onMessageMaj: (m: MessageChat) => void;
  onOuvrirResultat: (canalId: string, messageId: string) => void;
};

const heure = formatTime;
// « Awa écrit… », « Awa et Moussa écrivent… ».
const libelleFrappe = (noms: string[]) => {
  const prenoms = [...new Set(noms.map((n) => n.split(' ')[0]))];
  if (prenoms.length === 1) return `${prenoms[0]} écrit…`;
  if (prenoms.length === 2) return `${prenoms[0]} et ${prenoms[1]} écrivent…`;
  return `${prenoms.length} personnes écrivent…`;
};

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
  vue,
  annuaire,
  onFermer,
  onChoisirCanal,
  onRetourListe,
  onChargerPlus,
  onEnvoyer,
  onOuvrirAnnuaire,
  onNouveauDm,
  onVue,
  onCreerGroupe,
  onGroupeQuitte,
  onCanauxMaj,
  onOuvrirAnnuaireSansVue,
  ecrivent,
  lectures,
  messageCible,
  onMessageMaj,
  onOuvrirResultat,
}: Props) {
  const vueAnnuaire = vue === 'annuaire';
  const [fiche, setFiche] = useState<string | null>(null);
  const [reponse, setReponse] = useState<MessageChat | null>(null);
  const [edition, setEdition] = useState<MessageChat | null>(null);
  const [recherche, setRecherche] = useState('');
  // Changer de conversation efface la réponse ou la modification en cours.
  useEffect(() => {
    setReponse(null);
    setEdition(null);
  }, [canalActif?.id]);
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

  function envoyer(envoi: EnvoiMessage) {
    presDuBas.current = true;
    return onEnvoyer(envoi);
  }
  const titre =
    vue === 'annuaire'
      ? 'Nouvelle conversation'
      : vue === 'nouveau-groupe'
        ? 'Nouveau groupe'
        : vue === 'infos'
          ? canalActif?.type === 'projet'
            ? 'Discussion du projet'
            : 'Infos du groupe'
          : canalActif
            ? canalActif.nom
            : 'Messages';

  return (
    <div
      className="pchat"
      role="dialog"
      aria-modal="false"
      aria-label={canalActif ? `Conversation ${canalActif.nom}` : 'Messages'}
    >
      <header className="pchat-tete">
        {canalActif || vue !== 'liste' ? (
          <button
            type="button"
            className="pchat-retour"
            onClick={() =>
              vue === 'infos' ? onVue('liste') : vue === 'nouveau-groupe' ? onVue('annuaire') : onRetourListe()
            }
            aria-label="Retour"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
        ) : null}
        <div className="pchat-tete-txt">
          <strong>{titre}</strong>
          <span className={`pchat-etat pchat-etat--${etatFlux}`} role="status">
            {etatFlux === 'ouvert' && <span className="pchat-etat-point" aria-hidden />}
            {LIBELLE_ETAT[etatFlux]}
          </span>
        </div>
        {(canalActif?.type === 'groupe' || canalActif?.type === 'projet') && vue === 'liste' && (
          <button
            type="button"
            className="pchat-fermer"
            onClick={() => onVue('infos')}
            aria-label="Infos du groupe"
            title={`${canalActif.type === 'projet' ? 'Membres de la discussion' : 'Infos du groupe'} · ${canalActif.membres ?? ''} membres`}
          >
            <UsersRound size={18} />
          </button>
        )}
        {ecriture && !canalActif && vue === 'liste' && (
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
        <button type="button" className="pchat-fermer" onClick={onFermer} aria-label="Fermer les messages">
          <X size={18} />
        </button>
      </header>

      {vue === 'nouveau-groupe' ? (
        <NouveauGroupe annuaire={annuaire} onCreer={onCreerGroupe} />
      ) : vue === 'infos' && (canalActif?.type === 'groupe' || canalActif?.type === 'projet') ? (
        <InfosGroupe
          slug={slug}
          canal={canalActif}
          moiId={moiId}
          annuaire={annuaire}
          onChargerAnnuaire={onOuvrirAnnuaireSansVue}
          onQuitter={onGroupeQuitte}
          onMaj={onCanauxMaj}
        />
      ) : vueAnnuaire ? (
        <ul className="pchat-liste">
          <li>
            <button type="button" className="pchat-canal pchat-nouveau-groupe" onClick={() => onVue('nouveau-groupe')}>
              <span className="pchat-canal-pastille pchat-canal-pastille--groupe" aria-hidden>
                <UsersRound size={15} />
              </span>
              <span className="pchat-canal-nom">Nouveau groupe</span>
            </button>
          </li>
          {annuaire === null ? (
            <li className="pchat-vide">Chargement…</li>
          ) : annuaire.length === 0 ? (
            <li className="pchat-vide">Personne d’autre dans la société.</li>
          ) : (
            annuaire.map((m) => (
              <li key={m.utilisateurId} className="pchat-annuaire-ligne">
                <button type="button" className="pchat-canal" onClick={() => onNouveauDm(m.utilisateurId)}>
                  <PersonAvatar
                    name={m.nomAffiche || `${m.prenom} ${m.nom}`}
                    photo={m.photoUrl}
                    colorKey={m.utilisateurId}
                    size="sm"
                  />
                  <span className="pchat-canal-nom pchat-canal-nom--annuaire">
                    <span>{m.nomAffiche || `${m.prenom} ${m.nom}`}</span>
                    <span className="pchat-annuaire-role">
                      {m.role}
                      {m.cellule ? ` · ${m.cellule}` : ''}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="pchat-annuaire-fiche"
                  aria-label={`Fiche contact de ${m.nomAffiche || `${m.prenom} ${m.nom}`}`}
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
        <>
          <div className="pchat-recherche-bloc">
            <Search size={15} aria-hidden />
            <input
              className="pchat-recherche-champ"
              type="search"
              placeholder="Rechercher dans les messages…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher dans les messages"
            />
          </div>
          {recherche.trim().length >= 2 ? (
            <RechercheChat
              slug={slug}
              q={recherche}
              onOuvrir={(canalId, messageId) => {
                setRecherche('');
                onOuvrirResultat(canalId, messageId);
              }}
            />
          ) : (
            <ul className="pchat-liste">
              {canaux.length === 0 ? (
                <li className="pchat-vide">Aucun canal.</li>
              ) : (
                canaux.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="pchat-canal" onClick={() => onChoisirCanal(c.id)}>
                      <span className={`pchat-canal-pastille pchat-canal-pastille--${c.type}`} aria-hidden>
                        {c.type === 'direct' ? (
                          c.nom.charAt(0)
                        ) : c.type === 'groupe' ? (
                          <UsersRound size={15} />
                        ) : c.type === 'projet' ? (
                          <Briefcase size={15} />
                        ) : (
                          '#'
                        )}
                      </span>
                      <span className="pchat-canal-nom">{c.nom}</span>
                      {c.dernierMessageLe && <span className="pchat-canal-quand">{heure(c.dernierMessageLe)}</span>}
                      {c.nonLus > 0 && <span className="pchat-canal-badge">{c.nonLus}</span>}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="pchat-fil" ref={filRef} onScroll={surScroll}>
            {curseur && (
              <button type="button" className="pchat-plus" onClick={onChargerPlus} disabled={chargement}>
                {chargement ? 'Chargement…' : 'Messages plus anciens'}
              </button>
            )}
            {messages.length === 0 && !chargement ? (
              <p className="pchat-vide">Aucun message. Lance la conversation.</p>
            ) : (
              <FilMessages
                slug={slug}
                canalId={canalActif.id}
                moiId={moiId}
                messages={messages}
                lectures={lectures}
                messageCible={messageCible}
                ecriture={ecriture}
                onRepondre={(m) => {
                  setEdition(null);
                  setReponse(m);
                }}
                onModifier={(m) => {
                  setReponse(null);
                  setEdition(m);
                }}
                onMessageMaj={onMessageMaj}
              />
            )}
          </div>

          <p className="pchat-frappe" aria-live="polite">
            {ecrivent.length > 0 && (
              <>
                <span className="pchat-frappe-points" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
                {libelleFrappe(ecrivent)}
              </>
            )}
          </p>
          {!ecriture ? (
            <p className="pchat-saisie pchat-saisie--lecture">Lecture seule</p>
          ) : (
            <SaisieChat
              key={`${canalActif.id}:${edition?.id ?? ''}`}
              slug={slug}
              canal={canalActif}
              moiId={moiId}
              envoiEnCours={envoiEnCours}
              reponse={reponse}
              edition={edition}
              onAnnulerReponse={() => setReponse(null)}
              onAnnulerEdition={() => setEdition(null)}
              onEditionFaite={(m) => {
                setEdition(null);
                onMessageMaj(m);
              }}
              onEnvoyer={envoyer}
            />
          )}
        </>
      )}
      {fiche && <FicheContactModal slug={slug} utilisateurId={fiche} onClose={() => setFiche(null)} />}
    </div>
  );
}
