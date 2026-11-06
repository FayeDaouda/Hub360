'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, Info, Plus, UsersRound, X } from 'lucide-react';
import { FicheContactModal } from '@/components/contacts/fiche-contact';
import type { CanalChat, EtatFluxChat, MembreAnnuaire, MessageChat } from '@/lib/types';
import { PersonAvatar } from '@/components/ui/avatar';
import { InfosGroupe, NouveauGroupe } from './groupe-chat';
import { SaisieChat, TexteMessage } from './saisie-chat';

// Vue du panneau : liste, nouvelle conversation (annuaire), nouveau groupe,
// fiche du groupe ouvert (01/11/2026).
export type VueChat = 'liste' | 'annuaire' | 'nouveau-groupe' | 'infos';
import { addDays, formatDayLongMonth, formatTime, todayIso, toIsoDay } from '@hub/domain';

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
  onEnvoyer: (texte: string, mentionIds: string[]) => void;
  onOuvrirAnnuaire: () => void;
  onNouveauDm: (utilisateurId: string) => void;
  onVue: (v: VueChat) => void;
  onCreerGroupe: (nom: string, membreIds: string[]) => Promise<void>;
  onGroupeQuitte: () => void;
  onCanauxMaj: () => void;
  // Charge l'annuaire sans changer de vue (ajout de membres au groupe).
  onOuvrirAnnuaireSansVue: () => void;
};

const heure = formatTime;

function jour(iso: string): string {
  const d = toIsoDay(new Date(iso));
  const auj = todayIso();
  if (d === auj) return "Aujourd'hui";
  if (d === addDays(auj, -1)) return 'Hier';
  return formatDayLongMonth(iso);
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
}: Props) {
  const vueAnnuaire = vue === 'annuaire';
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

  function envoyer(texte: string, mentionIds: string[]) {
    presDuBas.current = true;
    onEnvoyer(texte, mentionIds);
  }
  const titre =
    vue === 'annuaire'
      ? 'Nouvelle conversation'
      : vue === 'nouveau-groupe'
        ? 'Nouveau groupe'
        : vue === 'infos'
          ? 'Infos du groupe'
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
        {canalActif?.type === 'groupe' && vue === 'liste' && (
          <button
            type="button"
            className="pchat-fermer"
            onClick={() => onVue('infos')}
            aria-label="Infos du groupe"
            title={`Infos du groupe · ${canalActif.membres ?? ''} membres`}
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
      ) : vue === 'infos' && canalActif?.type === 'groupe' ? (
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
        <ul className="pchat-liste">
          {canaux.length === 0 ? (
            <li className="pchat-vide">Aucun canal.</li>
          ) : (
            canaux.map((c) => (
              <li key={c.id}>
                <button type="button" className="pchat-canal" onClick={() => onChoisirCanal(c.id)}>
                  <span className={`pchat-canal-pastille pchat-canal-pastille--${c.type}`} aria-hidden>
                    {c.type === 'direct' ? c.nom.charAt(0) : c.type === 'groupe' ? <UsersRound size={15} /> : '#'}
                  </span>
                  <span className="pchat-canal-nom">{c.nom}</span>
                  {c.dernierMessageLe && <span className="pchat-canal-quand">{heure(c.dernierMessageLe)}</span>}
                  {c.nonLus > 0 && <span className="pchat-canal-badge">{c.nonLus}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
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
              messages.map((m, i) => {
                const prec = messages[i - 1];
                const nouveauJour = !prec || jour(prec.envoyeLe) !== jour(m.envoyeLe);
                const memeAuteur = prec && prec.auteur.id === m.auteur.id && !nouveauJour;
                const mien = m.auteur.id === moiId;
                const mentionne = !mien && !!m.mentions?.some((x) => x.id === moiId);
                return (
                  <div key={m.id}>
                    {nouveauJour && <div className="pchat-jour">{jour(m.envoyeLe)}</div>}
                    {m.systeme ? (
                      <div className="pchat-systeme">
                        {m.texte} · {heure(m.envoyeLe)}
                      </div>
                    ) : (
                      <div
                        className={`pchat-msg${mien ? ' pchat-msg--mien' : ''}${mentionne ? ' pchat-msg--mentionne' : ''}`}
                      >
                        {(!memeAuteur || prec?.systeme) && !mien && (
                          <span className="pchat-msg-auteur">{m.auteur.nom}</span>
                        )}
                        <span className="pchat-msg-bulle">
                          <TexteMessage texte={m.texte} mentions={m.mentions ?? []} moiId={moiId} />
                          <span className="pchat-msg-heure">{heure(m.envoyeLe)}</span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {!ecriture ? (
            <p className="pchat-saisie pchat-saisie--lecture">Lecture seule</p>
          ) : (
            <SaisieChat
              key={canalActif.id}
              slug={slug}
              canalId={canalActif.id}
              moiId={moiId}
              envoiEnCours={envoiEnCours}
              onEnvoyer={envoyer}
            />
          )}
        </>
      )}
      {fiche && <FicheContactModal slug={slug} utilisateurId={fiche} onClose={() => setFiche(null)} />}
    </div>
  );
}
