'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { CircleCheck, Search, TriangleAlert } from 'lucide-react';
import { addDays, formatDate, formatTime, todayIso } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import {
  changerCellulesProjet,
  getEtatInterventions,
  onboarderSansSignature,
  ouvrirProjet,
  rouvrirDossier,
  supprimerCode,
  type EtatInterventions,
} from '@/lib/interventions';
import { getJournalAudit } from '@/lib/pilotage';
import { STATUTS_CRM } from '@/lib/types';
import { Field } from '@/components/ui/field';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Pill, type PillTone } from '@/components/ui/pill';
import { recentUnblocks, type RecentUnblock, type UnblockKind } from '@/components/groupe/deblocages-insights';

type Action = 'onboard' | 'reouverture' | 'ouverture' | 'cellules' | 'suppression';

const ACTIONS: Record<Action, { titre: string; texte: string; confirmer: string; envoi: string; fait: string }> = {
  onboard: {
    titre: 'Passer en Onboard (offre acceptée)',
    texte:
      'Pour un dossier dont l’offre acceptée attend encore : comme à l’acceptation, le projet est créé, l’offre lui est rattachée et ses factures sont préparées en brouillon. Le contrat se régularise ensuite.',
    confirmer: 'Passer en Onboard',
    envoi: 'Passage en Onboard…',
    fait: 'passé en Onboard',
  },
  reouverture: {
    titre: 'Rouvrir le dossier perdu',
    texte: 'Le dossier revient en « Nouveau projet » : sa fiche redevient modifiable pour une nouvelle offre.',
    confirmer: 'Rouvrir le dossier',
    envoi: 'Réouverture…',
    fait: 'rouvert',
  },
  ouverture: {
    titre: 'Ouvrir le projet',
    texte:
      'Pour un projet resté fermé (Onboard antérieur au 30/10/2026) : la version en service du gabarit est recopiée en cartes et tâches, jour 1 aujourd’hui. Les factures restent en brouillon.',
    confirmer: 'Ouvrir le projet',
    envoi: 'Ouverture…',
    fait: 'ouvert',
  },
  cellules: {
    titre: 'Cellules du projet',
    texte:
      'Les cellules cochées remplacent celles du projet. Leur chef d’équipe valide les remises et leurs membres voient le projet.',
    confirmer: 'Enregistrer les cellules',
    envoi: 'Enregistrement…',
    fait: 'mis à jour (cellules)',
  },
  suppression: {
    titre: 'Supprimer définitivement',
    texte:
      'Le dossier CRM et son projet sont effacés avec tout ce qui en dépend : offres, contrat, factures (émises comprises), avoirs, paiements, cartes et tâches. C’est irréversible ; seule la trace au journal d’audit reste.',
    confirmer: 'Supprimer définitivement',
    envoi: 'Suppression…',
    fait: 'supprimé définitivement',
  },
};

type TypeHistorique = EtatInterventions['historique'][number]['type'];
const HISTORIQUE: Record<TypeHistorique, { libelle: string; ton: PillTone }> = {
  onboard_sans_signature: { libelle: 'Onboard débloqué', ton: 'succes' },
  ouverture_projet: { libelle: 'Projet ouvert sans F1', ton: 'info' },
  cellules_projet: { libelle: 'Cellules modifiées', ton: 'azur' },
  reouverture_dossier: { libelle: 'Dossier rouvert', ton: 'attention' },
  module_desactive: { libelle: 'Module désactivé', ton: 'neutre' },
  module_reactive: { libelle: 'Module réactivé', ton: 'neutre' },
  maintenance_activee: { libelle: 'Maintenance activée', ton: 'neutre' },
  maintenance_levee: { libelle: 'Maintenance levée', ton: 'neutre' },
  suppression: { libelle: 'Supprimé définitivement', ton: 'risque' },
  annuaire_perimetre: { libelle: 'Périmètre de l’annuaire', ton: 'neutre' },
};
// Un type ajouté côté serveur sans libellé ici : affiché tel quel, jamais une erreur.
const INCONNU = { libelle: 'Intervention', ton: 'neutre' as PillTone };
const RECENT: Record<UnblockKind, { libelle: string; ton: PillTone }> = {
  onboard: HISTORIQUE.onboard_sans_signature,
  ouverture: HISTORIQUE.ouverture_projet,
  cellules: HISTORIQUE.cellules_projet,
  reouverture: HISTORIQUE.reouverture_dossier,
  suppression: HISTORIQUE.suppression,
};

// Le texte du serveur n'est montré que pour un refus métier (400, 403, 404,
// 409…) ; une panne ou une coupure réseau reçoit un message humain.
const message = (e: unknown, repli: string) => (e instanceof ApiError && e.status < 500 ? e.message : repli);
// Forme d'un code de dossier ou de projet (« GB_TBD.26 ») : un texte venu de
// l'adresse qui n'en a pas la forme n'est ni cherché ni réaffiché.
const CODE = /^[\p{L}\p{N}_.-]{1,40}$/u;
const MESSAGE_CODE =
  'Un code ne contient que des lettres, des chiffres et les signes « _ », « . » ou « - » (40 caractères au plus).';

// Intervention demandée : sa cible est figée à l'ouverture de la fenêtre (une
// recherche qui répondrait entre-temps ne la change pas).
type Demande = { action: Action; code: string; dossierId: string | null; projetId: string | null };

const quiQuand = (par: string | null, le: string) =>
  `${par ?? 'Auteur inconnu'} · le ${formatDate(le)} à ${formatTime(le)}`;

// Administration du HUB › Déblocages (Administrateur HUB, 29/10/2026 ; refonte
// du 08/11/2026) : un dossier ou un projet retrouvé par son code — gardé dans
// l'adresse (?code=) pour y revenir par un lien —, les interventions que le
// parcours normal ne permet pas, la suppression définitive à part, et
// l'historique du code. Chaque intervention exige un motif, inscrit au journal.
export function DeblocagesPanel({ slug }: { slug: string }) {
  const pathname = usePathname();
  const codeLu = useSearchParams().get('code')?.trim() ?? '';
  const codeAdresse = CODE.test(codeLu) ? codeLu : '';
  // Saisie en cours ; null : le champ montre le dernier code demandé (ou celui de l'adresse).
  const [saisie, setSaisie] = useState<string | null>(null);
  // Dernier code demandé (en cours, trouvé ou en échec) : « Rechercher » le relance.
  const [demandeCode, setDemandeCode] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatInterventions | null>(null);
  const [cherche, setCherche] = useState<string | null>(null);
  const [recherche, setRecherche] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });
  const [demande, setDemande] = useState<Demande | null>(null);
  // Intervention faite : confirmée à l'écran et aux lecteurs d'écran.
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [supprime, setSupprime] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentUnblock[] | 'erreur' | null>(null);
  const [essaiRecents, setEssaiRecents] = useState(0);
  // Résultat d'une recherche, annoncé aux lecteurs d'écran.
  const [resultat, setResultat] = useState<string | null>(null);
  const declencheur = useRef<HTMLElement | null>(null);
  const lecture = useRef(0);
  const champ = useRef<HTMLInputElement>(null);

  const lancer = useCallback(
    async (valeur: string) => {
      const c = valeur.trim();
      if (!c) return;
      if (!CODE.test(c)) {
        setRecherche({ envoi: false, erreur: MESSAGE_CODE });
        return;
      }
      // La dernière recherche seule compte (lien suivi pendant une recherche).
      const n = ++lecture.current;
      setDemandeCode(c);
      setRecherche({ envoi: true, erreur: null });
      setAnnonce(null);
      setSupprime(null);
      setResultat(null);
      try {
        const e = await getEtatInterventions(slug, c);
        if (n !== lecture.current) return;
        setEtat(e);
        setCherche(c);
        // Ce qui a été tapé pendant la recherche reste dans le champ.
        setSaisie((s) => (s === null || s.trim() === c ? null : s));
        setRecherche({ envoi: false, erreur: null });
        setResultat(resume(c, e));
        ecrireCode(pathname, c);
      } catch (err) {
        if (n !== lecture.current) return;
        setRecherche({
          envoi: false,
          erreur: message(err, 'La recherche n’a pas abouti. Vérifiez votre connexion, puis réessayez.'),
        });
      }
    },
    [slug, pathname],
  );

  // Code dans l'adresse (lien partagé, Précédent) : cherché d'office.
  useEffect(() => {
    if (codeAdresse && codeAdresse !== cherche) void lancer(codeAdresse);
    // `cherche` n'est pas une dépendance : seule l'adresse déclenche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeAdresse, lancer]);

  // Interventions récentes (journal d'audit, 12 mois) : facultatives.
  useEffect(() => {
    let annule = false;
    const today = todayIso();
    getJournalAudit(slug, addDays(today, -364), today)
      .then((j) => !annule && setRecents(recentUnblocks(j.lignes)))
      .catch(() => !annule && setRecents('erreur'));
    return () => {
      annule = true;
    };
  }, [slug, essaiRecents]);

  function chercher(e: FormEvent) {
    e.preventDefault();
    void lancer(saisie ?? demandeCode ?? codeAdresse);
  }

  const ouvrir = (action: Action, bouton: HTMLElement) => {
    declencheur.current = bouton;
    setAnnonce(null);
    setDemande({ action, code: codeVise, dossierId: d?.id ?? null, projetId: p?.id ?? null });
  };
  const fermer = () => {
    setDemande(null);
    // Après une suppression, le bouton n'existe plus : retour au champ.
    requestAnimationFrame(() => (declencheur.current?.isConnected ? declencheur.current : champ.current)?.focus());
  };

  const valeur = saisie ?? demandeCode ?? codeAdresse;
  // Champ vidé : retour aux interventions récentes (le résultat est masqué).
  const vu = etat && valeur.trim() !== '' ? etat : null;
  const d = vu?.dossier ?? null;
  const p = vu?.projet ?? null;
  const codeVise = d?.code ?? p?.code ?? cherche ?? '';
  const peutOnboarder = !!d && d.statut === 'offre_envoyee' && d.offreAcceptee && !p;
  const trouve = !!vu && (!!d || !!p);
  // Code supprimé un autre jour : dit tel quel plutôt que « introuvable ».
  const supprimeLe = trouve ? undefined : vu?.historique.find((h) => h.type === 'suppression');
  const erreurFormat = recherche.erreur === MESSAGE_CODE;

  return (
    <section className="groupe-panel glass-panel deb" aria-label="Déblocages">
      {/* Titre et explication : en-tête commun de la console (app/groupe). */}
      <form className="deb-recherche" onSubmit={chercher} role="search">
        <label className="deb-recherche-champ">
          <span className="field-label">Code du dossier ou du projet</span>
          <span className="champ-recherche">
            <Search size={18} aria-hidden />
            <input
              ref={champ}
              className="field-input deb-code-saisie"
              placeholder="ex. GB_TBD.26"
              value={valeur}
              onChange={(e) => setSaisie(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={erreurFormat || undefined}
              aria-describedby={recherche.erreur ? 'deb-recherche-erreur' : undefined}
            />
          </span>
        </label>
        <button type="submit" className="btn-primary" disabled={recherche.envoi || !valeur.trim()}>
          {recherche.envoi ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>

      {recherche.erreur && (
        <div className="deb-erreur" role="alert">
          <p id="deb-recherche-erreur" className="field-erreur">
            {recherche.erreur}
          </p>
          {!erreurFormat && (
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => void lancer(valeur)}>
              Réessayer
            </button>
          )}
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {annonce ?? resultat ?? ''}
      </p>
      {annonce && (
        <p className="deb-succes">
          <CircleCheck size={18} aria-hidden />
          {annonce}
        </p>
      )}

      {/* Avant toute recherche (sauf code dans l'adresse, cherché d'office), ou champ vidé. */}
      {!recherche.envoi && (etat ? !vu : !codeAdresse) && (
        <Recents
          recents={recents}
          onOuvrir={(c) => void lancer(c)}
          onReessayer={() => {
            setRecents(null);
            setEssaiRecents((n) => n + 1);
          }}
        />
      )}

      {vu && !trouve && supprime !== cherche && supprimeLe && (
        <p className="deb-note deb-supprime">
          <span className="deb-code">{cherche}</span> a été supprimé définitivement (
          {quiQuand(supprimeLe.par, supprimeLe.le)}
          ). Seule sa trace au journal reste.
        </p>
      )}

      {vu && !trouve && supprime !== cherche && !supprimeLe && (
        <div className="deb-introuvable">
          <EmptyState>
            Aucun dossier ni projet avec le code « <span className="deb-code">{cherche}</span> ».
          </EmptyState>
          <p className="deb-note">
            Vérifiez le code tel qu’il figure sur le dossier (ex. GB_TBD.26), avec son point et ses majuscules.
          </p>
        </div>
      )}

      {trouve && (
        <div className="deb-grille">
          <article className="deb-carte" aria-labelledby="deb-dossier">
            <header className="deb-carte-tete">
              <h2 id="deb-dossier">Dossier CRM</h2>
              {d && (
                <Pill tone={d.statut === 'perdu' ? 'risque' : d.statut === 'onboard' ? 'succes' : 'info'}>
                  {STATUTS_CRM[d.statut]}
                </Pill>
              )}
            </header>
            {d ? (
              <>
                <p className="deb-identite">
                  <span className="deb-code">{d.code}</span>
                  <span className="deb-note">{d.client}</span>
                </p>
                <dl className="deb-faits">
                  <dt>Offre acceptée</dt>
                  <dd>{d.offreAcceptee ? 'Oui' : 'Non'}</dd>
                  <dt>Contrat signé</dt>
                  <dd>{d.contratSigne ? 'Oui' : 'Non'}</dd>
                </dl>
                <div className="deb-actions">
                  {peutOnboarder && (
                    <button
                      type="button"
                      className="btn-primary"
                      aria-haspopup="dialog"
                      disabled={recherche.envoi}
                      onClick={(e) => ouvrir('onboard', e.currentTarget)}
                    >
                      {ACTIONS.onboard.titre}
                    </button>
                  )}
                  {d.statut === 'perdu' && (
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-haspopup="dialog"
                      disabled={recherche.envoi}
                      onClick={(e) => ouvrir('reouverture', e.currentTarget)}
                    >
                      {ACTIONS.reouverture.titre}
                    </button>
                  )}
                  {!peutOnboarder && d.statut === 'offre_envoyee' && !d.offreAcceptee && (
                    <p className="deb-note">L’Onboard attend une offre acceptée par le client.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="deb-note">Aucun dossier CRM avec ce code (projet antérieur au CRM).</p>
            )}
          </article>

          <article className="deb-carte" aria-labelledby="deb-projet">
            <header className="deb-carte-tete">
              <h2 id="deb-projet">Projet</h2>
              {p && (
                <Pill tone={p.ouvertLe ? 'succes' : 'attention'}>
                  {p.ouvertLe ? `Ouvert, J1 le ${formatDate(p.ouvertLe)}` : 'Pas encore ouvert'}
                </Pill>
              )}
            </header>
            {p ? (
              <>
                <p className="deb-identite">
                  <span className="deb-code">{p.code}</span>
                </p>
                <dl className="deb-faits">
                  <dt>Cellules</dt>
                  <dd>{p.cellules.length ? p.cellules.map((c) => c.nom).join(', ') : 'Aucune'}</dd>
                </dl>
                <div className="deb-actions">
                  {!p.ouvertLe && p.gabarit && (
                    <button
                      type="button"
                      className="btn-primary"
                      aria-haspopup="dialog"
                      disabled={recherche.envoi}
                      onClick={(e) => ouvrir('ouverture', e.currentTarget)}
                    >
                      {ACTIONS.ouverture.titre}
                    </button>
                  )}
                  {!p.ouvertLe && !p.gabarit && (
                    <p className="deb-note">Pas de gabarit pour la catégorie de ce projet : il ne s’ouvre pas.</p>
                  )}
                  <button
                    type="button"
                    className="btn-ghost"
                    aria-haspopup="dialog"
                    disabled={recherche.envoi}
                    onClick={(e) => ouvrir('cellules', e.currentTarget)}
                  >
                    Modifier les cellules
                  </button>
                </div>
              </>
            ) : (
              <p className="deb-note">Pas encore de projet : il naît à l’Onboard du dossier.</p>
            )}
          </article>
        </div>
      )}

      {trouve && (
        <section className="deb-danger" aria-labelledby="deb-danger-titre">
          <span className="deb-danger-icone" aria-hidden>
            <TriangleAlert size={20} />
          </span>
          <div className="deb-danger-texte">
            <h2 id="deb-danger-titre">Zone dangereuse</h2>
            <p>
              Supprimer définitivement {d && p ? 'le dossier et son projet' : d ? 'le dossier' : 'le projet'}{' '}
              <span className="deb-code">{codeVise}</span> avec ses offres, factures, paiements et tâches. Irréversible
              : seule la trace au journal reste.
            </p>
          </div>
          <button
            type="button"
            className="btn-danger"
            aria-haspopup="dialog"
            disabled={recherche.envoi}
            onClick={(e) => ouvrir('suppression', e.currentTarget)}
          >
            Supprimer définitivement…
          </button>
        </section>
      )}

      {vu && vu.historique.length > 0 && (
        <section className="deb-bloc" aria-labelledby="deb-historique">
          <h2 id="deb-historique" className="deb-sous-titre">
            Interventions sur ce code
          </h2>
          <ol className="deb-historique">
            {vu.historique.map((h) => (
              <li key={h.id} className={`deb-evenement deb-evenement--${(HISTORIQUE[h.type] ?? INCONNU).ton}`}>
                <span className="deb-point" aria-hidden />
                <div>
                  <p className="deb-evenement-titre">
                    <strong>{(HISTORIQUE[h.type] ?? INCONNU).libelle}</strong>
                    {h.detail && <span className="deb-note"> · {h.detail}</span>}
                  </p>
                  {h.motif && <p className="deb-motif">Motif : « {h.motif} »</p>}
                  <p className="deb-trace">{quiQuand(h.par, h.le)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {demande && etat && (
        <ModaleIntervention
          demande={demande}
          etat={etat}
          onClose={fermer}
          onFait={(maj) => {
            // L'écran se réaligne sur le code de l'intervention (une recherche
            // lancée entre-temps, par un lien, est abandonnée) : cartes, champ et
            // adresse désignent le même code.
            ++lecture.current;
            setRecherche({ envoi: false, erreur: null });
            setEtat(maj);
            setCherche(demande.code);
            setDemandeCode(demande.code);
            setSaisie(null);
            ecrireCode(pathname, demande.code);
            if (demande.action === 'suppression') {
              setSupprime(cherche);
              setAnnonce(`${demande.code} supprimé définitivement. La trace reste au journal d’audit.`);
            } else {
              setAnnonce(`${demande.code} ${ACTIONS[demande.action].fait}. Intervention inscrite au journal d’audit.`);
            }
            fermer();
          }}
          executer={(motif, celluleIds) => {
            const { action, code, dossierId, projetId } = demande;
            if (action === 'suppression') return supprimerCode(slug, code, motif);
            if (action === 'onboard' && dossierId) return onboarderSansSignature(slug, dossierId, motif);
            if (action === 'reouverture' && dossierId) return rouvrirDossier(slug, dossierId, motif);
            if (action === 'ouverture' && projetId) return ouvrirProjet(slug, projetId, motif);
            if (action === 'cellules' && projetId) return changerCellulesProjet(slug, projetId, celluleIds, motif);
            return Promise.reject(new Error('Cible introuvable'));
          }}
        />
      )}
    </section>
  );
}

// Code cherché dans l'adresse (sans entrée d'historique ; `null` : le routeur
// de Next la prend en compte). Les autres paramètres (onglet) sont gardés.
// « CM_SAC.26 : dossier Onboard, projet ouvert. »
function resume(code: string, e: EtatInterventions): string {
  if (!e.dossier && !e.projet)
    return e.historique.some((h) => h.type === 'suppression')
      ? `${code} a été supprimé définitivement.`
      : `Aucun dossier ni projet avec le code ${code}.`;
  const dossier = e.dossier ? `dossier ${STATUTS_CRM[e.dossier.statut]}` : 'pas de dossier CRM';
  const projet = e.projet ? (e.projet.ouvertLe ? 'projet ouvert' : 'projet pas encore ouvert') : 'pas encore de projet';
  return `${code} : ${dossier}, ${projet}.`;
}

function ecrireCode(pathname: string, code: string) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('code') === code) return;
  params.set('code', code);
  try {
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
  } catch {
    // Navigateur qui limite les appels : l'écran reste juste.
  }
}

function Recents({
  recents,
  onOuvrir,
  onReessayer,
}: {
  recents: RecentUnblock[] | 'erreur' | null;
  onOuvrir: (code: string) => void;
  onReessayer: () => void;
}) {
  return (
    <section className="deb-bloc" aria-labelledby="deb-recents">
      <h2 id="deb-recents" className="deb-sous-titre">
        Interventions récentes
      </h2>
      {recents === 'erreur' ? (
        <div className="deb-erreur">
          <p className="deb-note">
            Les interventions récentes n’ont pas pu être chargées. Vous pouvez chercher un code.
          </p>
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={onReessayer}>
            Réessayer
          </button>
        </div>
      ) : recents === null ? (
        <div aria-busy="true" aria-label="Chargement des interventions récentes">
          <Skeleton size="sm" />
        </div>
      ) : recents.length === 0 ? (
        <p className="deb-note">Aucune intervention ces douze derniers mois. Cherchez un code pour commencer.</p>
      ) : (
        <ul className="deb-recents">
          {recents.map((r) => (
            <li key={r.id}>
              <button type="button" className="deb-recent" onClick={() => onOuvrir(r.code)}>
                <span className="deb-code">{r.code}</span>
                <Pill tone={RECENT[r.kind].ton}>{RECENT[r.kind].libelle}</Pill>
                <span className="deb-recent-trace">{quiQuand(r.par, r.le)}</span>
                {r.motif && <span className="deb-recent-motif">« {r.motif} »</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ModaleIntervention({
  demande,
  etat,
  onClose,
  onFait,
  executer,
}: {
  demande: Demande;
  etat: EtatInterventions;
  onClose: () => void;
  onFait: (etat: EtatInterventions) => void;
  executer: (motif: string, celluleIds: string[]) => Promise<EtatInterventions>;
}) {
  const { action, code } = demande;
  const a = ACTIONS[action];
  // Suppression : ce qui est effacé, selon ce qui existe.
  const texte =
    action !== 'suppression'
      ? a.texte
      : demande.dossierId && demande.projetId
        ? a.texte
        : demande.dossierId
          ? 'Le dossier CRM est effacé avec tout ce qui en dépend : offres, contrat, factures (émises comprises), avoirs et paiements. C’est irréversible ; seule la trace au journal d’audit reste.'
          : 'Le projet est effacé avec tout ce qui en dépend : factures (émises comprises), avoirs, paiements, cartes et tâches. C’est irréversible ; seule la trace au journal d’audit reste.';
  const [motif, setMotif] = useState('');
  const [cellules, setCellules] = useState<string[]>(etat.projet?.cellules.map((c) => c.id) ?? []);
  // Suppression : le code retapé à l'identique confirme.
  const [confirmation, setConfirmation] = useState('');
  const confirme = action !== 'suppression' || confirmation.trim() === code;
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      onFait(await executer(motif.trim(), cellules));
    } catch (err) {
      setErreur(message(err, 'L’intervention n’a pas été enregistrée. Rien n’a changé ; réessayez dans un instant.'));
      setEnvoi(false);
    }
  }

  const basculer = (id: string) => setCellules((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  return (
    <Modal
      onClose={onClose}
      busy={envoi}
      portal
      trapFocus
      role={action === 'suppression' ? 'alertdialog' : 'dialog'}
      describedBy="deb-modale-texte"
      className="modal--sm"
      label={a.titre}
    >
      <ModalHeader title={a.titre} onClose={onClose} closeDisabled={envoi} />
      <form className="modal-body deb-modale" onSubmit={valider}>
        <p className="deb-modale-cible">
          Code visé : <span className="deb-code">{code}</span>
        </p>
        <p id="deb-modale-texte">{texte}</p>
        {action === 'cellules' &&
          (etat.cellulesDisponibles.length ? (
            <fieldset className="deb-cellules">
              <legend className="field-label">Cellules</legend>
              {etat.cellulesDisponibles.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" checked={cellules.includes(c.id)} onChange={() => basculer(c.id)} /> {c.nom}{' '}
                  <span className="deb-note">{c.code}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="deb-note">Aucune cellule dans cette société : créez-les dans Équipes.</p>
          ))}
        <Field label="Motif">
          <input
            className="field-input"
            maxLength={500}
            required
            minLength={3}
            aria-describedby="deb-motif-aide"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            autoFocus
          />
        </Field>
        <p id="deb-motif-aide" className="field-hint deb-motif-aide">
          Obligatoire, 3 caractères au moins. Inscrit au journal d’audit.
        </p>
        {action === 'suppression' && (
          <Field label={`Retapez ${code} pour confirmer`}>
            <input
              className="field-input deb-code-saisie"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        )}
        {erreur && (
          <p className="field-erreur" role="alert">
            {erreur}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={onClose} disabled={envoi}>
            Annuler
          </button>
          <button
            type="submit"
            className={action === 'suppression' ? 'btn-danger' : 'btn-primary'}
            disabled={envoi || motif.trim().length < 3 || !confirme}
          >
            {envoi ? a.envoi : a.confirmer}
          </button>
        </div>
      </form>
    </Modal>
  );
}
