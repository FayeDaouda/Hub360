'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AtSign, CalendarPlus, CheckCheck, Hourglass, MessageCircle } from 'lucide-react';
import { KpiStrip, type KpiTuile } from '@/components/admin/kpi-strip';
import { DEGRADE_ETAT, etatATraiter, etatEnRetard, type EtatTuile } from '@/lib/couleurs-etat';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { niveauSuffisant } from '@/lib/auth';
import { consultationEtCommentaires, ROLE_DIR_GC, ROLE_SALARIE, sectionAccessible } from '@/lib/acces-back-office';
import {
  ajouterTs,
  definirDateVisite,
  getAssignables,
  getDossierProjet,
  getMentionnables,
  getTableauProjets,
  heuresTache,
  jjmm,
  jjmmaaaa,
  numeroEtape,
  pastilleCarte,
  pastilleEtape,
  pastilleTache,
  type Assignable,
  type CarteOuverte,
  type DossierProjetOuvert,
  type TableauProjets,
} from '@/lib/projets-ouverts';
import { TachePanneau } from './tache-panneau';
import { CartePanneau } from './carte-panneau';

// Panneau de droite : une tâche, ou le fil d'une carte.
type Selection = { type: 'tache' | 'carte'; id: string } | null;

const HEURES_PAR_JOUR = 8;

// Projets · gabarit (maquette « Projets » du boss, vue CIO) : tuiles, projets
// ouverts, et le dossier du projet choisi — étapes, cartes, tâches.
export function ProjetsOuverts({ slug }: { slug: string }) {
  const session = useSessionCourante();
  const [tableau, setTableau] = useState<TableauProjets | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // ?projet= : lien d'une notification (mention dans un fil).
  const projetDemande = useSearchParams().get('projet');
  const [projetId, setProjetId] = useState<string | null>(projetDemande);
  const [dossier, setDossier] = useState<DossierProjetOuvert | null>(null);
  const [etape, setEtape] = useState(1);
  const [selection, setSelection] = useState<Selection>(null);
  // « À valider par vous » : la remise à ouvrir une fois son dossier chargé.
  const [aOuvrir, setAOuvrir] = useState<{ projetId: string; tacheId: string } | null>(null);
  // Écran tenu dans la fenêtre (desktop, cf. globals.css) : la hauteur
  // disponible part du haut réel de la page, mesuré (barre du haut comprise).
  const racine = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = racine.current;
    if (!el) return;
    const mesurer = () => el.style.setProperty('--po-haut', `${el.getBoundingClientRect().top + window.scrollY}px`);
    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, []);
  // « Lecture et assignation » : la liste n'est chargée que pour qui assigne.
  const peutAssigner = niveauSuffisant(session, 'projets', 'ecriture');
  const dplg = session.role === ROLE_DIR_GC;
  const salarie = session.role === ROLE_SALARIE;
  // CEO, CFO : lecture, et les fils en écriture (exception ciblée, revérifiée
  // par le serveur) ; aucune action de circuit.
  const consultation = consultationEtCommentaires(session);
  const [assignables, setAssignables] = useState<Assignable[] | null>(null);
  const [mentionnables, setMentionnables] = useState<{ id: string; nom: string }[] | null>(null);

  useTitrePage(`Projets · gabarit ${tableau?.gabarit ?? 'GC-CONCEPTION'}`);

  const chargerTableau = useCallback(
    () =>
      getTableauProjets(slug)
        .then((t) => {
          setTableau(t);
          setProjetId((id) => id ?? t.projets[0]?.id ?? null);
        })
        .catch((e) => setErreur(e instanceof Error ? e.message : 'Lecture impossible.')),
    [slug],
  );
  useEffect(() => {
    chargerTableau();
  }, [chargerTableau]);

  // Fil en écriture : qui écrit sur Projets, le Salarié sur ses projets, CEO et CFO.
  const peutEcrireFil = peutAssigner || salarie || consultation;
  useEffect(() => {
    if (peutAssigner) {
      getAssignables(slug)
        .then(setAssignables)
        .catch(() => setAssignables(null));
    }
    if (peutEcrireFil) {
      getMentionnables(slug)
        .then(setMentionnables)
        .catch(() => setMentionnables(null));
    }
  }, [slug, peutAssigner, peutEcrireFil]);

  // Après une écriture : le dossier et les tuiles relus, la tâche choisie gardée.
  const recharger = useCallback(async () => {
    if (projetId) setDossier(await getDossierProjet(slug, projetId));
    await chargerTableau();
  }, [slug, projetId, chargerTableau]);

  // Ouvre l'étape et le panneau de la remise demandée, dossier chargé.
  useEffect(() => {
    if (!aOuvrir || dossier?.id !== aOuvrir.projetId) return;
    const carte = dossier.cartes.find((c) => c.taches.some((t) => t.id === aOuvrir.tacheId));
    if (carte) {
      setEtape(carte.etapeNumero);
      setSelection({ type: 'tache', id: aOuvrir.tacheId });
    }
    setAOuvrir(null);
  }, [aOuvrir, dossier]);

  function ouvrirRemiseAValider() {
    const premiere = tableau?.kpi.aValiderParVous[0];
    if (!premiere) return;
    setAOuvrir(premiere);
    setProjetId(premiere.projetId);
  }

  useEffect(() => {
    if (!projetId) return;
    let annule = false;
    setDossier(null);
    setSelection(null);
    getDossierProjet(slug, projetId)
      .then((d) => !annule && setDossier(d))
      .catch((e) => !annule && setErreur(e instanceof Error ? e.message : 'Lecture impossible.'));
    return () => {
      annule = true;
    };
  }, [slug, projetId]);

  const horizon = tableau ? Math.round(tableau.budgetHeures / HEURES_PAR_JOUR) : null;
  const acces = dplg
    ? 'Architecte DPLG : assignation, désactivation, prolongations, validation en suppléance'
    : salarie
      ? 'Salarié : remise, prolongation, discussion ; le chef de team valide'
      : consultation
        ? 'Consultation et commentaires'
        : peutAssigner
          ? 'Lecture et assignation · accès complet'
          : 'Lecture seule';

  return (
    <div className="po" ref={racine}>
      <div className="po-entete">
        <p className="po-sous-titre">
          Étapes → cartes → tâches générées depuis le devis signé à l’émission de F1
          {horizon !== null && ` · ${horizon} jours ouvrés (${tableau!.budgetHeures} h)`}, délais figés, validation par le chef de team.
        </p>
        <div className="po-entete-actions">
          {/* Réglages : réservés au CIO (page Paramètres hors matrice). */}
          {sectionAccessible(session, 'parametres') && (
            <Link className="btn-ghost" href={`/admin/${slug}/reglages?section=gabarit`}>
              Gabarit et paramètres
            </Link>
          )}
          <span className="po-acces">{acces}</span>
        </div>
      </div>

      {erreur && <p className="field-erreur">{erreur}</p>}

      <div className="po-kpi">
        <KpiStrip tuiles={tuilesProjets(tableau, dplg || salarie, salarie, ouvrirRemiseAValider)} />
      </div>

      {tableau && tableau.projets.length === 0 ? (
        <section className="panel glass-panel po-vide">
          <h2>Aucun projet ouvert</h2>
          <p className="po-aide">
            Un projet s’ouvre à l’émission de sa facture F1 (Réglages · Ouverture du projet) : ses étapes, cartes et tâches sont alors
            générées depuis le gabarit, délais figés.
          </p>
        </section>
      ) : (
        <div className="po-colonnes">
          <section className="panel glass-panel po-liste" aria-label="Projets ouverts">
            <h2 className="po-liste-titre">Projets ouverts</h2>
            {!tableau ? (
              <div className="skeleton admin-skeleton-panel" aria-hidden />
            ) : (
              <ul>
                {tableau.projets.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`po-projet${p.id === projetId ? ' is-actif' : ''}`}
                      aria-pressed={p.id === projetId}
                      onClick={() => setProjetId(p.id)}
                    >
                      <span className="po-projet-tete">
                        <span className="po-code">{p.code}</span>
                        <span className={`pill pill--${p.enRetard ? 'risque' : 'succes'}`}>
                          {p.enRetard ? `${p.enRetard} en retard` : 'Dans les délais'}
                        </span>
                      </span>
                      <span className="po-projet-client">{p.client}</span>
                      <span className="po-barre" aria-hidden>
                        <span style={{ width: `${p.total ? Math.round((p.faites / p.total) * 100) : 0}%` }} />
                      </span>
                      <span className="po-aide">
                        {p.cellule ?? 'Cellule à assigner'} · J{p.jour} / {p.horizon} · {p.faites}/{p.total} tâches
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel glass-panel po-dossier" aria-label="Dossier projet">
            {!dossier ? (
              <div className="skeleton admin-skeleton-panel" aria-hidden />
            ) : (
              <Dossier
                slug={slug}
                dossier={dossier}
                etape={etape}
                onEtape={setEtape}
                selection={selection}
                onSelection={setSelection}
                assignables={peutAssigner ? assignables : null}
                moiId={session.utilisateur.id}
                mentionnables={peutEcrireFil ? mentionnables : null}
                onMaj={recharger}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// Tuiles du tableau (couleur = sens, lib/couleurs-etat.ts) : ambre à
// traiter, rouge en retard (tâches, TS non acceptés), vert rien en attente.
function tuilesProjets(
  tableau: TableauProjets | null,
  valideur: boolean,
  salarie: boolean,
  ouvrirRemise: () => void,
): KpiTuile[] {
  const k = tableau?.kpi;
  const n = (v: number | undefined) => (v === undefined ? '…' : v);
  const etat = (v: number | undefined, f: (x: number) => EtatTuile) => DEGRADE_ETAT[v === undefined ? 'marque' : f(v)];
  const aValider = k?.aValiderParVous.length;
  const signalements = k ? (salarie ? k.mentions : k.tsNonAcceptes + k.mentions) : undefined;
  return [
    valideur
      ? {
          cle: 'a-valider',
          label: 'À valider par vous',
          valeur: n(aValider),
          sousTexte: 'jamais sa propre tâche · cliquer pour valider',
          icone: CheckCheck,
          degrade: etat(aValider, etatATraiter),
          ...(aValider ? { action: { type: 'popup' as const, onClick: ouvrirRemise } } : {}),
        }
      : {
          cle: 'remises',
          label: 'Remises à valider',
          valeur: n(k?.remisesAValider),
          sousTexte: 'tous projets · chef de team ou DPLG',
          icone: CheckCheck,
          degrade: etat(k?.remisesAValider, etatATraiter),
        },
    {
      cle: 'retard',
      label: 'Tâches en retard',
      valeur: n(k?.tachesEnRetard),
      sousTexte: 'échéance de référence dépassée',
      icone: Hourglass,
      degrade: etat(k?.tachesEnRetard, etatEnRetard),
    },
    {
      cle: 'prolongations',
      label: 'Prolongations à décider',
      valeur: n(k?.prolongations),
      sousTexte: 'le retard est qualifié par le chef de team ou le DPLG',
      icone: CalendarPlus,
      degrade: etat(k?.prolongations, etatATraiter),
    },
    {
      cle: 'signalements',
      label: 'Signalements et mentions',
      valeur: n(signalements),
      sousTexte: salarie || !k ? 'mises à jour à reporter, @mentions' : `${k.tsNonAcceptes} TS non accepté(s) · ${k.mentions} tâche(s)`,
      icone: AtSign,
      // TS au-delà du délai réglé = en retard ; mention ouverte = à traiter.
      degrade: DEGRADE_ETAT[!k ? 'marque' : !salarie && k.tsNonAcceptes > 0 ? 'risque' : etatATraiter(k.mentions)],
    },
  ];
}

type PropsDossier = {
  slug: string;
  dossier: DossierProjetOuvert;
  etape: number;
  onEtape: (n: number) => void;
  selection: Selection;
  onSelection: (s: Selection) => void;
  assignables: Assignable[] | null;
  moiId: string;
  mentionnables: { id: string; nom: string }[] | null;
  onMaj: () => Promise<void>;
};

function Dossier({ slug, dossier: d, etape, onEtape, selection, onSelection, assignables, moiId, mentionnables, onMaj }: PropsDossier) {
  const cartes = d.cartes.filter((c) => c.etapeNumero === etape);
  const ecriture = niveauSuffisant(useSessionCourante(), 'projets', 'ecriture');
  const tacheId = selection?.type === 'tache' ? selection.id : null;
  const choisie = d.cartes.flatMap((c) => c.taches.map((t) => ({ carte: c, tache: t }))).find((x) => x.tache.id === tacheId) ?? null;
  const carteFil = selection?.type === 'carte' ? d.cartes.find((c) => c.id === selection.id) ?? null : null;
  const factures = pastillesFactures(d);

  return (
    <>
      <header className="po-dossier-tete">
        <div>
          <p className="po-kicker">Dossier projet</p>
          <h2 className="po-dossier-titre">
            <span className="po-code po-code--grand">{d.code}</span> {d.client.nom}
          </h2>
          <p className="po-aide">
            {d.cellule ? `${libelleCellule(d.cellule.nom)} · chef de team ${d.cellule.chef ?? 'à désigner'}` : 'Cellule à assigner'}
            {d.cellule?.chef && ` · validation aujourd’hui : ${d.cellule.chef}`} · pilote des études : {d.pilote}
            {d.version && ` · ${d.version.code} ${d.version.libelle}`}
            {d.offre && ` depuis ${d.offre}`}
          </p>
          <div className="po-pastilles">
            {factures.map((f) => (
              <span key={f.libelle} className={`pill pill--${f.ton}`}>
                {f.libelle}
              </span>
            ))}
          </div>
        </div>
        <div className="po-dossier-jour">
          <strong>
            J{d.jour} / {d.horizon}
          </strong>
          <span className="po-aide">
            J1 le {jjmmaaaa(d.ouvertLe)} → livraison J{d.horizon} le {jjmmaaaa(d.livraisonLe)}
          </span>
          {d.budgetHeures !== null && <span className="po-aide">Budget atelier {d.budgetHeures} h · durée, pas une somme d’heures</span>}
        </div>
      </header>

      <div className="po-etapes" role="tablist" aria-label="Étapes">
        {d.etapes.map((e) => {
          const p = pastilleEtape(e);
          return (
            <button
              key={e.numero}
              type="button"
              role="tab"
              aria-selected={e.numero === etape}
              className={`po-etape${e.numero === etape ? ' is-actif' : ''}`}
              onClick={() => {
                onEtape(e.numero);
                onSelection(null);
              }}
            >
              <span className="po-etape-tete">
                <span>{numeroEtape(e.numero)}</span>
                <span>
                  {e.faites}/{e.total} tâches
                </span>
              </span>
              <strong>{e.libelle}</strong>
              <span className={`pill pill--${p.ton}`}>{p.libelle}</span>
            </button>
          );
        })}
      </div>

      {d.optionsTs.length > 0 && <AjoutTs slug={slug} dossier={d} onMaj={onMaj} />}

      <div className="po-corps">
        {/* key : changer d'étape repart du haut de la liste des cartes. */}
        <div className="po-cartes" key={etape}>
          {cartes.map((c) => (
            <Carte
              key={c.id}
              carte={c}
              tacheId={tacheId}
              filActif={carteFil?.id === c.id}
              onTache={(id) => onSelection({ type: 'tache', id })}
              onFil={() => onSelection({ type: 'carte', id: c.id })}
              visite={
                c.cle === CARTE_RELEVES
                  ? { slug, projetId: d.id, date: d.dateVisiteSite, modifiable: ecriture, onMaj }
                  : undefined
              }
            />
          ))}
        </div>
        {choisie ? (
          <TachePanneau
            key={choisie.tache.id}
            slug={slug}
            projetId={d.id}
            code={d.code}
            carte={choisie.carte}
            tache={choisie.tache}
            assignables={assignables}
            moiId={moiId}
            mentionnables={mentionnables}
            onMaj={onMaj}
          />
        ) : carteFil ? (
          <CartePanneau key={carteFil.id} slug={slug} projetId={d.id} carte={carteFil} moiId={moiId} mentionnables={mentionnables} onMaj={onMaj} />
        ) : (
          <p className="po-panneau po-panneau--vide">
            Cliquez une tâche pour voir son descriptif, l’assigner ou en discuter. Chaque carte a aussi son fil de discussion.
          </p>
        )}
      </div>
    </>
  );
}

// « Ajouter en TS » (Architecte DPLG) : l'élément demandé par le client
// devient une tâche de la carte choisie, son temps s'ajoute au budget atelier.
function AjoutTs({ slug, dossier: d, onMaj }: { slug: string; dossier: DossierProjetOuvert; onMaj: () => Promise<void> }) {
  const [carteId, setCarteId] = useState(d.optionsTs[0].carteId);
  const [element, setElement] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  async function ajouter() {
    setEnvoi(true);
    setMessage(null);
    try {
      const t = await ajouterTs(slug, d.id, carteId, element.trim());
      setElement('');
      setMessage({ ok: true, texte: `${t.libelle} ajoutée au projet.` });
      await onMaj();
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error && e.message ? e.message : 'L’ajout en TS a échoué.' });
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="po-ts">
      <div className="po-ts-ligne">
        <select className="field-input" aria-label="Type d’élément" value={carteId} onChange={(e) => setCarteId(e.target.value)}>
          {d.optionsTs.map((o) => (
            <option key={o.carteId} value={o.carteId}>
              {o.libelle} ({o.heures} h)
            </option>
          ))}
        </select>
        <input
          className="field-input"
          value={element}
          maxLength={80}
          placeholder="Élément ajouté par le client (ex. Bureau)"
          onChange={(e) => setElement(e.target.value)}
        />
        <button type="button" className="btn-primary" disabled={envoi || element.trim().length < 2} onClick={ajouter}>
          {envoi ? 'Ajout…' : 'Ajouter en TS'}
        </button>
      </div>
      {message && <p className={message.ok ? 'po-aide' : 'field-erreur'}>{message.texte}</p>}
    </div>
  );
}

// Carte du gabarit dont les relevés sont dus 24 h après la visite sur site.
const CARTE_RELEVES = 'releves_existants';

type PropsCarte = {
  carte: CarteOuverte;
  tacheId: string | null;
  filActif: boolean;
  onTache: (id: string) => void;
  onFil: () => void;
  visite?: { slug: string; projetId: string; date: string | null; modifiable: boolean; onMaj: () => Promise<void> };
};

function Carte({ carte: c, tacheId, filActif, onTache, onFil, visite }: PropsCarte) {
  const p = pastilleCarte(c.etat);
  const eteinte = c.etat.code === 'desactivee';
  // « délai en heures ouvrées depuis J1 » : la fenêtre se lit aussi en heures.
  const enHeures = c.note?.includes('heures ouvrées') && c.debutJ !== null && c.finJ !== null;
  const fenetre =
    c.debutJ !== null && c.debutLe && c.finLe
      ? `J${c.debutJ} → J${c.finJ} · ${jjmm(c.debutLe)} → ${jjmm(c.finLe)}${enHeures ? ` · ${(c.finJ! - c.debutJ + 1) * HEURES_PAR_JOUR} h ouvrées` : ''}`
      : c.note?.split(' : ')[0] ?? null;
  const etiquettes = [c.etiquette, c.client ? 'CLIENT · hors budget atelier' : null].filter((x): x is string => !!x);

  return (
    <article className={`po-carte${eteinte ? ' is-eteinte' : ''}`}>
      <header className="po-carte-tete">
        <div>
          <p className="po-kicker po-kicker--code">{c.cle.toUpperCase()}</p>
          <h3>{c.libelle}</h3>
        </div>
        <div className="po-carte-droite">
          <span className={`pill pill--${p.ton}`}>{p.libelle}</span>
          {fenetre && <span className="po-aide">{fenetre}</span>}
          {etiquettes.map((e) => (
            <span key={e} className="pill pill--neutre">
              {e}
            </span>
          ))}
        </div>
      </header>
      {c.descriptif && <p className="po-aide po-carte-descriptif">{c.descriptif}</p>}
      {visite && <DateVisite {...visite} />}
      {c.etat.code === 'verrouillee' && (
        <p className="po-attente">S’ouvre quand ces tâches sont validées : {c.etat.attend.join(', ')}.</p>
      )}
      {c.fichiers ? (
        <p className="po-aide">Aucun fichier source déposé dans cette étape.</p>
      ) : c.taches.length === 0 ? (
        <p className="po-aide">Aucune tâche générée pour ce projet.</p>
      ) : (
        <ul className="po-taches">
          {c.taches.map((t) => {
            const pt = pastilleTache(t.etat);
            const eteint = t.etat.code === 'non_necessaire' || t.etat.code === 'desactivee';
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={`po-tache${t.id === tacheId ? ' is-actif' : ''}${eteint ? ' is-eteinte' : ''}`}
                  aria-pressed={t.id === tacheId}
                  onClick={() => onTache(t.id)}
                >
                  <span className="po-tache-libelle">
                    <strong>{t.libelle}</strong>
                    <span className="po-aide">
                      {t.cle.replace(/_/g, ' ')}
                      {t.motif && ` · ${t.motif}`}
                    </span>
                  </span>
                  <span className="po-tache-assigne">{t.assigne?.nom ?? 'À assigner'}</span>
                  <span className="po-tache-heures">{heuresTache(t)}</span>
                  <span className={`po-tache-echeance${t.etat.code === 'en_retard' ? ' po-retard' : ''}`}>{t.finLe ? jjmm(t.finLe) : '—'}</span>
                  <span className="po-tache-etat">
                    <span className={`pill pill--${pt.ton}`}>{pt.libelle}</span>
                    {t.fil > 0 && (
                      <span className="po-tache-fil" aria-label={`${t.fil} message(s)`}>
                        <MessageCircle size={13} strokeWidth={2} aria-hidden /> {t.fil}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className={`po-fil-bouton${filActif ? ' is-actif' : ''}`} aria-pressed={filActif} onClick={onFil}>
        Fil de la carte · {c.fil}
      </button>
    </article>
  );
}

// « F1 émise · projet ouvert », « F2 attend 02, 03, récépissé 04 »… La
// première facture en attente est mise en avant (maquette).
function pastillesFactures(d: DossierProjetOuvert) {
  let premiere = true;
  return (['F1', 'F2', 'F3'] as const).map((f) => {
    if (d.factures[f] === 'emise') return { libelle: f === 'F1' ? 'F1 émise · projet ouvert' : `${f} émise`, ton: 'succes' };
    const attend = f === 'F1' ? [] : d.attentes[f];
    const ton = premiere ? 'attention' : 'neutre';
    premiere = false;
    return { libelle: attend.length ? `${f} attend ${attend.join(', ')}` : `${f} à émettre`, ton };
  });
}

// « Cellule Archi 3 » est déjà nommée ; « GC-ARC-02 » (maquette) ne l'est pas.
const libelleCellule = (nom: string) => (/^cellule\b/i.test(nom) ? nom : `Cellule ${nom}`);

// Date de visite sur site (carte « Relevés existants ») : une fois saisie, les
// relevés sont dus le lendemain (24 h calendaires) et entrent dans le suivi
// des délais.
function DateVisite({ slug, projetId, date, modifiable, onMaj }: NonNullable<PropsCarte['visite']>) {
  const [erreur, setErreur] = useState<string | null>(null);
  async function changer(valeur: string) {
    setErreur(null);
    try {
      await definirDateVisite(slug, projetId, valeur || null);
      await onMaj();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'Date non enregistrée.');
    }
  }
  return (
    <div className="po-visite">
      {modifiable ? (
        <label className="po-visite-champ">
          <span>Date de visite sur site</span>
          <input type="date" className="field-input" value={date ?? ''} onChange={(e) => changer(e.target.value)} />
        </label>
      ) : (
        <p className="po-aide">Visite sur site : {date ? jjmm(date) : 'date non renseignée'}</p>
      )}
      {!date && <p className="po-aide">Sans date de visite, ces relevés n’ont pas d’échéance.</p>}
      {erreur && <p className="field-erreur">{erreur}</p>}
    </div>
  );
}
