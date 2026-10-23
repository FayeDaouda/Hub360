'use client';

import { DecisionsFiche } from '@/components/pilotage/decisions-fiche';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlarmClock, AtSign, CalendarPlus, CheckCheck, ChevronDown, Hourglass, MessageCircle, RotateCcw } from 'lucide-react';
import { KpiStrip, type KpiTuile } from '@/components/admin/kpi-strip';
import { etatATraiter, etatEnRetard, type EtatTuile } from '@/lib/couleurs-etat';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { niveauSuffisant } from '@/lib/auth';
import { getMesTaches } from '@/lib/mon-espace';
import { consultationEtCommentaires, ROLE_DIR_GC, ROLE_SALARIE, sectionAccessible } from '@/lib/acces-back-office';
import {
  ajouterTs,
  definirDateVisite,
  definirStatutChantier,
  getAssignables,
  getDossierProjet,
  getMentionnables,
  getMesMentions,
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
  STATUTS_CHANTIER,
  type StatutChantier,
  type TableauProjets,
} from '@/lib/projets-ouverts';
import { TachePanneau } from './tache-panneau';
import { CartePanneau } from './carte-panneau';
import { PanneauLateral } from './panneau-lateral';

// Panneau latéral : une tâche, ou le fil d'une carte.
type Selection = { type: 'tache' | 'carte'; id: string } | null;

const HEURES_PAR_JOUR = 8;

// Projets · gabarit (maquette « Projets » du boss, vue CIO) : tuiles, projets
// ouverts, et le dossier du projet choisi — étapes, cartes, tâches.
export function ProjetsOuverts({ slug }: { slug: string }) {
  const session = useSessionCourante();
  const [tableau, setTableau] = useState<TableauProjets | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // ?projet= : lien d'une notification (mention dans un fil) ; &tache= : la
  // tâche à ouvrir (« À décider aujourd'hui » du Dir. GC).
  const parametres = useSearchParams();
  const projetDemande = parametres.get('projet');
  const tacheDemandee = parametres.get('tache');
  const [projetId, setProjetId] = useState<string | null>(projetDemande);
  const [dossier, setDossier] = useState<DossierProjetOuvert | null>(null);
  const [etape, setEtape] = useState(1);
  const [selection, setSelection] = useState<Selection>(null);
  // « À valider par vous » : la remise à ouvrir une fois son dossier chargé.
  const [aOuvrir, setAOuvrir] = useState<{ projetId: string; tacheId: string } | null>(
    projetDemande && tacheDemandee ? { projetId: projetDemande, tacheId: tacheDemandee } : null,
  );
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
  // « Seulement mes tâches » (revue Salarié 19/10/2026) : actif d'office
  // pour le Salarié, proposé à quiconque a une tâche dans le projet.
  const [miennes, setMiennes] = useState(salarie);
  // Tuiles du Salarié : SES tâches (pas le total du projet), ses mentions.
  const [perso, setPerso] = useState<{ reprises: number; retards: number; attente: number; mentions: number } | null>(null);
  // CEO, CFO : lecture, et les fils en écriture (exception ciblée, revérifiée
  // par le serveur) ; aucune action de circuit.
  const consultation = consultationEtCommentaires(session);
  const [assignables, setAssignables] = useState<Assignable[] | null>(null);
  const [mentionnables, setMentionnables] = useState<{ id: string; nom: string }[] | null>(null);

  // Le nom du gabarit parle à la direction, pas au Salarié (revue mobile 20/10/2026).
  useTitrePage(salarie ? 'Projets' : `Projets · gabarit ${tableau?.gabarit ?? 'GC-CONCEPTION'}`);

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
  const chargerPerso = useCallback(() => {
    if (!salarie) return;
    Promise.all([getMesTaches(slug), getMesMentions(slug)])
      .then(([t, m]) =>
        setPerso({
          reprises: t.taches.filter((x) => x.statut === 'a_reprendre').length,
          retards: t.taches.filter((x) => x.statut === 'en_retard').length,
          attente: t.taches.filter((x) => x.statut === 'remise').length,
          mentions: m.filter((x) => !x.lue).length,
        }),
      )
      .catch(() => setPerso(null));
  }, [slug, salarie]);
  useEffect(chargerPerso, [chargerPerso]);

  const recharger = useCallback(async () => {
    if (projetId) setDossier(await getDossierProjet(slug, projetId));
    await chargerTableau();
    chargerPerso();
  }, [slug, projetId, chargerTableau, chargerPerso]);

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
      .then((d) => {
        if (annule) return;
        setDossier(d);
        setEtape(etapeParDefaut(d));
      })
      .catch((e) => !annule && setErreur(e instanceof Error ? e.message : 'Lecture impossible.'));
    return () => {
      annule = true;
    };
  }, [slug, projetId]);

  const horizon = tableau ? Math.round(tableau.budgetHeures / HEURES_PAR_JOUR) : null;
  const compacte = !!tableau && tableau.projets.length < 3;
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
          {salarie ? (
            'Les projets où vous avez une tâche : ce que vous avez à rendre, son échéance et les échanges avec l’équipe.'
          ) : (
            <>
              Étapes → cartes → tâches générées depuis le devis signé à l’émission de F1
              {horizon !== null && ` · ${horizon} jours ouvrés (${tableau!.budgetHeures} h)`}, délais figés, validation par le chef de team.
            </>
          )}
        </p>
        <div className="po-entete-actions">
          {/* Réglages : réservés au CIO (page Paramètres hors matrice). */}
          {sectionAccessible(session, 'parametres') && (
            <Link className="btn-ghost" href={`/admin/${slug}/reglages?section=gabarit`}>
              Gabarit et paramètres
            </Link>
          )}
          {!salarie && <span className="po-acces">{acces}</span>}
        </div>
      </div>

      {erreur && <p className="field-erreur">{erreur}</p>}

      <div className="po-kpi">
        <KpiStrip
          tuiles={
            salarie ? tuilesSalarie(perso, tableau, slug, ouvrirRemiseAValider) : tuilesProjets(tableau, dplg, false, ouvrirRemiseAValider)
          }
        />
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
        <div className={`po-colonnes${compacte ? ' po-colonnes--compacte' : ''}`}>
          {compacte && tableau ? (
            // Moins de 3 projets : un sélecteur en ligne, le dossier prend la largeur.
            <div className="po-projets-ligne" role="group" aria-label="Projets ouverts">
              {tableau.projets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`po-projet po-projet--ligne${p.id === projetId ? ' is-actif' : ''}`}
                  aria-pressed={p.id === projetId}
                  onClick={() => setProjetId(p.id)}
                >
                  <span className="po-code">{p.code}</span>
                  <span className="po-projet-client">{p.client}</span>
                  <span className={`pill pill--${p.livraisonDepassee || p.enRetard ? 'risque' : 'succes'}`}>
                    {p.livraisonDepassee ? 'Livraison dépassée' : p.enRetard ? `${p.enRetard} en retard` : 'Dans les délais'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
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
                          <span className={`pill pill--${p.livraisonDepassee || p.enRetard ? 'risque' : 'succes'}`}>
                            {p.livraisonDepassee ? 'Livraison dépassée' : p.enRetard ? `${p.enRetard} en retard` : 'Dans les délais'}
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
          )}

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
                salarie={salarie}
                miennes={miennes}
                onMiennes={setMiennes}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// Étape ouverte à l'arrivée : celle de ma première tâche en cours, sinon la
// première étape pas finie (plutôt que 01, souvent déjà close).
function etapeParDefaut(d: DossierProjetOuvert): number {
  const ouverte = (statut: string) => statut !== 'validee' && statut !== 'non_necessaire';
  const miennes = d.cartes.filter((c) => c.taches.some((t) => t.aMoi && ouverte(t.statut))).map((c) => c.etapeNumero);
  if (miennes.length) return Math.min(...miennes);
  return d.etapes.find((e) => e.faites < e.total)?.numero ?? d.etapes[0]?.numero ?? 1;
}

// Tuiles du Salarié (revue 19/10/2026) : SES tâches et ses mentions — le
// total du projet l'alarmait à tort. Chacune ouvre « Mes tâches » filtré ;
// chef de cellule avec des remises en attente : « À valider par vous ».
function tuilesSalarie(
  perso: { reprises: number; retards: number; attente: number; mentions: number } | null,
  tableau: TableauProjets | null,
  slug: string,
  ouvrirRemise: () => void,
): KpiTuile[] {
  const n = (v: number | undefined) => (v === undefined ? '…' : v);
  const etat = (v: number | undefined, f: (x: number) => EtatTuile): EtatTuile => (v === undefined ? 'marque' : f(v));
  const lien = (filtre: string) => ({ type: 'lien' as const, href: `/admin/${slug}/mes-taches?filtre=${filtre}` });
  const aValider = tableau?.kpi.aValiderParVous.length ?? 0;
  return [
    {
      cle: 'reprises',
      label: 'Mes tâches à reprendre',
      valeur: n(perso?.reprises),
      sousTexte: 'renvoyées par votre N+1',
      icone: RotateCcw,
      etat: etat(perso?.reprises, etatEnRetard),
      action: lien('reprises'),
    },
    {
      cle: 'retard',
      label: 'Mes tâches en retard',
      valeur: n(perso?.retards),
      sousTexte: 'échéance dépassée',
      icone: AlarmClock,
      etat: etat(perso?.retards, etatEnRetard),
      action: lien('retards'),
    },
    {
      cle: 'attente',
      label: 'Mes remises en attente',
      valeur: n(perso?.attente),
      sousTexte: 'chez votre chef de team',
      icone: Hourglass,
      etat: etat(perso?.attente, etatATraiter),
      action: lien('attente'),
    },
    aValider > 0
      ? {
          cle: 'a-valider',
          label: 'À valider par vous',
          valeur: aValider,
          sousTexte: 'remises de votre cellule',
          icone: CheckCheck,
          etat: etatATraiter(aValider),
          action: { type: 'popup' as const, onClick: ouvrirRemise },
        }
      : {
          cle: 'mentions',
          label: 'Mentions à lire',
          valeur: n(perso?.mentions),
          sousTexte: 'dans les fils des projets',
          icone: AtSign,
          etat: etat(perso?.mentions, etatATraiter),
          action: lien('mentions'),
        },
  ];
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
  const etat = (v: number | undefined, f: (x: number) => EtatTuile): EtatTuile => (v === undefined ? 'marque' : f(v));
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
          etat: etat(aValider, etatATraiter),
          ...(aValider ? { action: { type: 'popup' as const, onClick: ouvrirRemise } } : {}),
        }
      : {
          cle: 'remises',
          label: 'Remises à valider',
          valeur: n(k?.remisesAValider),
          sousTexte: 'tous projets · chef de team ou DPLG',
          icone: CheckCheck,
          etat: etat(k?.remisesAValider, etatATraiter),
        },
    {
      cle: 'retard',
      label: 'Tâches en retard',
      valeur: n(k?.tachesEnRetard),
      sousTexte: 'échéance de référence dépassée',
      icone: Hourglass,
      etat: etat(k?.tachesEnRetard, etatEnRetard),
    },
    {
      cle: 'prolongations',
      label: 'Prolongations à décider',
      valeur: n(k?.prolongations),
      sousTexte: 'le retard est qualifié par le chef de team ou le DPLG',
      icone: CalendarPlus,
      etat: etat(k?.prolongations, etatATraiter),
    },
    {
      cle: 'signalements',
      label: 'Signalements et mentions',
      valeur: n(signalements),
      sousTexte: salarie || !k ? 'mises à jour à reporter, @mentions' : `${k.tsNonAcceptes} TS non accepté(s) · ${k.mentions} tâche(s)`,
      icone: AtSign,
      // TS au-delà du délai réglé = en retard ; mention ouverte = à traiter.
      etat: !k ? 'marque' : !salarie && k.tsNonAcceptes > 0 ? 'risque' : etatATraiter(k.mentions),
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
  salarie: boolean;
  miennes: boolean;
  onMiennes: (v: boolean) => void;
};

const ouverte = (statut: string) => statut !== 'validee' && statut !== 'non_necessaire';

function Dossier({ slug, dossier: d, etape, onEtape, selection, onSelection, assignables, moiId, mentionnables, onMaj, salarie, miennes, onMiennes }: PropsDossier) {
  // « Seulement mes tâches » : proposé dès qu'une tâche du projet est à moi.
  const aDesMiennes = d.cartes.some((c) => c.taches.some((t) => t.aMoi));
  const filtrer = miennes && aDesMiennes;
  const cartes = d.cartes
    .filter((c) => c.etapeNumero === etape)
    .map((c) => (filtrer ? { ...c, taches: c.taches.filter((t) => t.aMoi) } : c))
    .filter((c) => !filtrer || c.taches.length > 0);
  const mesOuvertes = (numero: number) =>
    d.cartes.filter((c) => c.etapeNumero === numero).reduce((n, c) => n + c.taches.filter((t) => t.aMoi && ouverte(t.statut)).length, 0);
  const ecriture = niveauSuffisant(useSessionCourante(), 'projets', 'ecriture');
  const tacheId = selection?.type === 'tache' ? selection.id : null;
  const choisie = d.cartes.flatMap((c) => c.taches.map((t) => ({ carte: c, tache: t }))).find((x) => x.tache.id === tacheId) ?? null;
  const carteFil = selection?.type === 'carte' ? d.cartes.find((c) => c.id === selection.id) ?? null : null;
  const factures = pastillesFactures(d);
  // Bandeau des étapes défilant (mobile) : l'étape ouverte reste visible.
  const etapesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    etapesRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [etape]);

  return (
    <>
      <header className="po-dossier-tete">
        <div>
          <p className="po-kicker">Dossier projet</p>
          <h2 className="po-dossier-titre">
            <span className="po-code po-code--grand">{d.code}</span> {d.client.nom}
          </h2>
          {salarie ? (
            // Revue Salarié : l'essentiel, sans le vocabulaire de direction.
            <p className="po-aide">
              J{d.jour} sur {d.horizon} · livraison le {jjmmaaaa(d.livraisonLe)} ·{' '}
              {d.jeSuisChef ? 'vous pilotez la cellule' : `votre chef de team : ${d.cellule?.chef ?? 'à désigner'}`}
            </p>
          ) : (
            <>
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
            </>
          )}
        </div>
        <div className="po-dossier-jour">
          <strong>
            J{d.jour} / {d.horizon}
          </strong>
          {/* Le Salarié a déjà J et livraison dans sa ligne d'en-tête. */}
          {!salarie && (
            <span className="po-aide">
              J1 le {jjmmaaaa(d.ouvertLe)} → livraison J{d.horizon} le {jjmmaaaa(d.livraisonLe)}
            </span>
          )}
          {d.jour > d.horizon && d.statutChantier !== 'livre' && <span className="pill pill--risque">Livraison dépassée</span>}
          {d.budgetHeures !== null && !salarie && <span className="po-aide">Budget atelier {d.budgetHeures} h · durée, pas une somme d’heures</span>}
          <StatutProjet slug={slug} projetId={d.id} statut={d.statutChantier} modifiable={ecriture} onMaj={onMaj} />
        </div>
      </header>
      <DecisionsFiche slug={slug} cible={{ projet: d.id }} />

      <div className="po-etapes" role="tablist" aria-label="Étapes" ref={etapesRef}>
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
              <span className="po-etape-pied">
                <span className={`pill pill--${p.ton}`}>{p.libelle}</span>
                {mesOuvertes(e.numero) > 0 && (
                  <span className="po-etape-moi" title="Vos tâches en cours dans cette étape">
                    {mesOuvertes(e.numero)} à moi
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {d.optionsTs.length > 0 && <AjoutTs slug={slug} dossier={d} onMaj={onMaj} />}

      {aDesMiennes && (
        <label className="po-miennes">
          <input type="checkbox" checked={miennes} onChange={(e) => onMiennes(e.target.checked)} />
          Seulement mes tâches
        </label>
      )}

      <div className="po-corps">
        {/* key : changer d'étape repart du haut de la liste des cartes. */}
        <div className="po-cartes" key={`${etape}:${filtrer}`}>
          {cartes.length === 0 && filtrer && (
            <p className="po-aide">
              Aucune de vos tâches dans cette étape.{' '}
              <button type="button" className="lien-inline po-lien-bouton" onClick={() => onMiennes(false)}>
                Voir toutes les tâches
              </button>
            </p>
          )}
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
      </div>

      {/* Tâche ou fil d'une carte : panneau latéral, le dossier garde la largeur. */}
      {(choisie || carteFil) && (
        <PanneauLateral
          titre={choisie ? `Tâche ${choisie.tache.libelle}` : `Fil de la carte ${carteFil!.libelle}`}
          onClose={() => onSelection(null)}
          entete={
            <>
              <p className="fiche-crm-code">{d.code}</p>
              <p className="fiche-crm-meta">{d.client.nom}</p>
            </>
          }
        >
          {choisie ? (
            <TachePanneau
              key={choisie.tache.id}
              slug={slug}
              projetId={d.id}
              code={d.code}
              carte={choisie.carte}
              tache={choisie.tache}
              assignables={d.peutAssigner ? assignables : null}
              moiId={moiId}
              mentionnables={mentionnables}
              onMaj={onMaj}
            />
          ) : (
            <CartePanneau key={carteFil!.id} slug={slug} projetId={d.id} carte={carteFil!} moiId={moiId} mentionnables={mentionnables} onMaj={onMaj} />
          )}
        </PanneauLateral>
      )}
    </>
  );
}

// « Ajouter en TS » (Architecte DPLG) : l'élément demandé par le client
// devient une tâche de la carte choisie, son temps s'ajoute au budget atelier.
function AjoutTs({ slug, dossier: d, onMaj }: { slug: string; dossier: DossierProjetOuvert; onMaj: () => Promise<void> }) {
  const [carteId, setCarteId] = useState(d.optionsTs[0].carteId);
  const [element, setElement] = useState('');
  const [reprise, setReprise] = useState<'mineure' | 'majeure'>('mineure');
  const [surface, setSurface] = useState('');
  const [planches, setPlanches] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  async function ajouter() {
    setEnvoi(true);
    setMessage(null);
    try {
      const t = await ajouterTs(
        slug,
        d.id,
        carteId,
        element.trim(),
        reprise === 'majeure' ? { reprise, surfaceM2: Number(surface), planches: Number(planches) } : { reprise },
      );
      setElement('');
      setSurface('');
      setPlanches('');
      if ('enAttente' in t) {
        // Au-delà du seuil : rien n'est ajouté tant que le CTO n'a pas validé.
        setMessage({
          ok: true,
          texte: `TS chiffré à ${t.montantHt.toLocaleString('fr-FR')} FCFA HT, au-delà du seuil de ${t.seuil.toLocaleString('fr-FR')} FCFA : demande envoyée au CTO. Il sera ajouté au projet et à l’avenant dès sa validation.`,
        });
        return;
      }
      setMessage({ ok: true, texte: `${t.libelle} ajoutée au projet et au devis d’avenant (en préparation, à envoyer au client).` });
      await onMaj();
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error && e.message ? e.message : 'L’ajout en TS a échoué.' });
    } finally {
      setEnvoi(false);
    }
  }

  const entier = (v: string) => Number.isInteger(Number(v)) && Number(v) >= 1;
  const valide = element.trim().length >= 2 && (reprise === 'mineure' || (entier(surface) && entier(planches)));

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
        <button type="button" className="btn-primary" disabled={envoi || !valide} onClick={ajouter}>
          {envoi ? 'Ajout…' : 'Ajouter en TS'}
        </button>
      </div>
      <div className="po-ts-ligne po-ts-reprise">
        <select
          className="field-input"
          aria-label="Chiffrage de l’avenant"
          value={reprise}
          onChange={(e) => setReprise(e.target.value as 'mineure' | 'majeure')}
        >
          <option value="mineure">Reprise mineure (TS-MIN, forfait)</option>
          <option value="majeure">Reprise majeure (TS-MAJ, tarif CO × surface × planches)</option>
        </select>
        {reprise === 'majeure' && (
          <>
            <input
              className="field-input"
              type="number"
              min={1}
              inputMode="numeric"
              aria-label="Surface concernée (m²)"
              placeholder="Surface concernée (m²)"
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
            />
            <input
              className="field-input"
              type="number"
              min={1}
              inputMode="numeric"
              aria-label="Planches concernées"
              placeholder="Planches"
              value={planches}
              onChange={(e) => setPlanches(e.target.value)}
            />
          </>
        )}
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
  // Carte close (tout validé) : repliée sur une ligne, dépliable au clic.
  const repliable = c.etat.code === 'close';
  const [deplie, setDeplie] = useState(!repliable);
  if (repliable && !deplie) {
    return (
      <article className="po-carte po-carte--repliee">
        <button type="button" className="po-carte-deplier" aria-expanded={false} onClick={() => setDeplie(true)}>
          <span className="po-carte-repliee-titre">
            <ChevronDown size={16} aria-hidden className="po-chevron" />
            {c.libelle}
          </span>
          <span className="po-carte-repliee-droite">
            <span className="po-aide">
              {c.taches.length} tâche{c.taches.length > 1 ? 's' : ''}
            </span>
            <span className={`pill pill--${p.ton}`}>{p.libelle}</span>
          </span>
        </button>
      </article>
    );
  }
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
          {repliable && (
            <button type="button" className="po-carte-replier" aria-expanded onClick={() => setDeplie(false)} aria-label={`Replier ${c.libelle}`}>
              <ChevronDown size={16} aria-hidden />
            </button>
          )}
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
                    {(!memeLibelle(t.cle, t.libelle) || t.motif) && (
                      <span className="po-aide">
                        {[!memeLibelle(t.cle, t.libelle) && t.cle.replace(/_/g, ' '), t.motif].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="po-tache-assigne">{t.assigne?.nom ?? 'À assigner'}</span>
                  <span className="po-tache-heures">{heuresTache(t)}</span>
                  <span className={`po-tache-echeance${t.etat.code === 'en_retard' ? ' po-retard' : ''}`}>{t.finLe ? jjmm(t.finLe) : '—'}</span>
                  <span className="po-tache-etat">
                    <span className={`pill pill--${pt.ton}`}>{pt.libelle}</span>
                    {t.fil > 0 && (
                      <span className="po-tache-fil" aria-label={`${t.fil} message(s)`}>
                        <MessageCircle size={13} aria-hidden /> {t.fil}
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

// Clé technique (« laterale_droite ») qui ne fait que répéter le libellé.
const normaliser = (x: string) =>
  x
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const memeLibelle = (cle: string, libelle: string) => normaliser(cle) === normaliser(libelle);

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

// Statut simple « En conception / En chantier / Livré » (14/10/2026) : posé
// par qui modifie les projets (DPLG, CTO) ; la facturation SU/EX s'y fie.
function StatutProjet({
  slug,
  projetId,
  statut,
  modifiable,
  onMaj,
}: {
  slug: string;
  projetId: string;
  statut: StatutChantier;
  modifiable: boolean;
  onMaj: () => Promise<void>;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  if (!modifiable) return <span className="pill pill--neutre po-statut-chantier">{STATUTS_CHANTIER[statut]}</span>;
  return (
    <label className="po-statut-chantier">
      <span className="po-aide">Statut</span>
      <select
        className="field-input"
        value={statut}
        onChange={async (e) => {
          setErreur(null);
          try {
            await definirStatutChantier(slug, projetId, e.target.value as StatutChantier);
            await onMaj();
          } catch (err) {
            setErreur(err instanceof Error && err.message ? err.message : 'Statut non enregistré.');
          }
        }}
      >
        {(Object.keys(STATUTS_CHANTIER) as StatutChantier[]).map((k) => (
          <option key={k} value={k}>
            {STATUTS_CHANTIER[k]}
          </option>
        ))}
      </select>
      {erreur && <span className="field-erreur">{erreur}</span>}
    </label>
  );
}
