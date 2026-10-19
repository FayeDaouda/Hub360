'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlarmClock, AtSign, CalendarClock, ChevronDown, Hourglass, Paperclip, RotateCcw, X, type LucideIcon } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { getAbsencesAValider } from '@/lib/demandes';
import { lireFichier } from '@/lib/fichiers';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { ecartJours, getMesTaches, getTachesAValider } from '@/lib/mon-espace';
import { getMesMentions, marquerMentionLue, publierCommentaire, type MentionRecue } from '@/lib/projets-ouverts';
import type { StatsPerformances, TacheMonEspace } from '@/lib/types';
import { RemiseModal } from '@/components/mon-espace/remise-modal';
import { TacheDrawer } from './tache-drawer';

type MesTachesApi = { taches: TacheMonEspace[]; stats: StatsPerformances };
type Filtre = 'reprises' | 'retards' | 'semaine' | 'attente' | 'mentions';
type Vue = 'urgence' | 'projet';
// Ton de couleur (tokens --pill-*) : bande de la ligne, compteur du filtre.
type Ton = 'risque' | 'attention' | 'info' | 'iris' | 'neutre';
type Pieces = { nom: string; url: string }[];

const MAX_PIECES = 5;
const CLE_VUE = 'hub.mes-taches.vue';
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const parEcheance = (a: TacheMonEspace, b: TacheMonEspace) => (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999');
const decaler = (iso: string, jours: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
};
const jourSemaine = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

// Échéance lue d'un coup d'œil : « 14 j de retard », « Aujourd’hui », « Dans 3 j ».
function relatif(echeance: string, aujourdhui: string): string {
  const n = ecartJours(aujourdhui, echeance);
  if (n < 0) return `${-n} j de retard`;
  if (n === 0) return 'Aujourd’hui';
  if (n === 1) return 'Demain';
  return `Dans ${n} j`;
}

const FILTRES: { cle: Filtre; libelle: string; aide: string; icone: LucideIcon; ton: Ton }[] = [
  { cle: 'reprises', libelle: 'À reprendre', aide: 'renvoyées par votre N+1', icone: RotateCcw, ton: 'risque' },
  { cle: 'retards', libelle: 'En retard', aide: 'échéance dépassée', icone: AlarmClock, ton: 'risque' },
  { cle: 'semaine', libelle: 'Cette semaine', aide: 'à rendre d’ici dimanche', icone: CalendarClock, ton: 'attention' },
  { cle: 'attente', libelle: 'En validation', aide: 'remises chez votre N+1', icone: Hourglass, ton: 'info' },
  { cle: 'mentions', libelle: 'Mentions', aide: 'à lire dans les fils', icone: AtSign, ton: 'iris' },
];

// « Mes tâches » (revue Salarié, 19/10/2026) : la réponse à « qu'est-ce que
// je dois faire aujourd'hui ? ». En-tête fixe (barre du haut, filtres, frise
// de la semaine) ; un filtre ou un jour n'affiche que sa liste. Une tâche
// s'ouvre en panneau latéral (celui de Projets) ; un fichier glissé sur sa
// ligne prépare sa remise. Vue par urgence ou par projet.
export function MesTaches({ slug }: { slug: string }) {
  useTitrePage('Mes tâches');
  const { utilisateur } = useSessionCourante();
  const base = `/admin/${slug}`;
  const aujourdhui = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [donnees, setDonnees] = useState<MesTachesApi | null>(null);
  const [mentions, setMentions] = useState<MentionRecue[]>([]);
  const [aDecider, setADecider] = useState({ taches: 0, absences: 0 });
  // ?filtre= : lien d'une tuile de Projets (« Mes tâches en retard »…).
  const demande = useSearchParams().get('filtre');
  const [filtreChoisi, setFiltre] = useState<Filtre | null>(FILTRES.some((f) => f.cle === demande) ? (demande as Filtre) : null);
  const [jour, setJour] = useState<string | null>(null);
  const [vue, setVue] = useState<Vue>('urgence');
  const [tiroir, setTiroir] = useState<{ projetId: string; tacheId: string; prolongation: boolean } | null>(null);
  const [aRemettre, setARemettre] = useState<{ tache: TacheMonEspace; pieces?: Pieces } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEnteteFixe();

  // Vue préférée : confort de cet appareil seulement.
  useEffect(() => {
    try {
      if (localStorage.getItem(CLE_VUE) === 'projet') setVue('projet');
    } catch {
      /* stockage indisponible : vue par urgence */
    }
  }, []);
  function choisirVue(v: Vue) {
    setVue(v);
    try {
      localStorage.setItem(CLE_VUE, v);
    } catch {
      /* idem */
    }
  }

  const chargerTaches = useCallback(
    () =>
      getMesTaches(slug)
        .then(setDonnees)
        .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger vos tâches.')),
    [slug],
  );
  const chargerMentions = useCallback(
    () =>
      getMesMentions(slug)
        .then(setMentions)
        .catch(() => setMentions([])),
    [slug],
  );
  useEffect(() => {
    void chargerTaches();
    void chargerMentions();
    // Complément : son échec ne bloque pas la liste.
    Promise.all([getTachesAValider(slug), getAbsencesAValider(slug)])
      .then(([t, a]) => setADecider({ taches: t.length, absences: a.length }))
      .catch(() => setADecider({ taches: 0, absences: 0 }));
  }, [slug, chargerTaches, chargerMentions]);

  const g = useMemo(() => {
    const ouvertes = (donnees?.taches ?? []).filter((t) => t.statut !== 'validee').sort(parEcheance);
    const lundi = decaler(aujourdhui, -((jourSemaine(aujourdhui) + 6) % 7));
    const dimanche = decaler(lundi, 6);
    const reprises = ouvertes.filter((t) => t.statut === 'a_reprendre');
    const retards = ouvertes.filter((t) => t.statut === 'en_retard');
    const semaine = ouvertes.filter((t) => (t.statut === 'en_cours' || t.statut === 'a_venir') && !!t.echeance && t.echeance <= dimanche);
    const attente = ouvertes.filter((t) => t.statut === 'remise');
    const classees = new Set([...reprises, ...retards, ...semaine, ...attente]);
    const ensuite = ouvertes.filter((t) => !classees.has(t));
    // Ton d'une tâche, quelle que soit la vue : la bande de sa ligne.
    const tonDe = (t: TacheMonEspace): Ton =>
      reprises.includes(t) || retards.includes(t) ? 'risque' : semaine.includes(t) ? 'attention' : attente.includes(t) ? 'info' : 'neutre';
    // Ordre d'urgence (vue par projet) : reprise, retard, semaine, validation, le reste.
    const rang = (t: TacheMonEspace) => {
      const i = [reprises, retards, semaine, attente].findIndex((l) => l.includes(t));
      return i < 0 ? 4 : i;
    };
    const jours = [0, 1, 2, 3, 4].map((i) => {
      const d = decaler(lundi, i);
      return { date: d, n: ouvertes.filter((t) => t.statut !== 'remise' && t.echeance === d).length };
    });
    return { ouvertes, reprises, retards, semaine, attente, ensuite, dimanche, jours, tonDe, rang };
  }, [donnees, aujourdhui]);

  const nonLues = mentions.filter((m) => !m.lue).length;
  const compte: Record<Filtre, number> = {
    reprises: g.reprises.length,
    retards: g.retards.length,
    semaine: g.semaine.length,
    attente: g.attente.length,
    mentions: nonLues,
  };
  const disponible = (f: Filtre) => (f === 'mentions' ? mentions.length > 0 : compte[f] > 0);
  // Un filtre dont la liste s'est vidée (dernière tâche remise) rend « tout ».
  const filtre = filtreChoisi && disponible(filtreChoisi) ? filtreChoisi : null;

  if (!donnees) {
    return erreur ? (
      <p className="empty-state">{erreur}</p>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  const urgences = compte.reprises + compte.retards + compte.semaine;
  const nbADecider = aDecider.taches + aDecider.absences;
  const filtreActif = FILTRES.find((f) => f.cle === filtre);
  const auMoinsUnFiltre = filtre !== null || jour !== null;

  function choisirFiltre(f: Filtre) {
    setJour(null);
    setFiltre((x) => (x === f ? null : f));
  }
  function choisirJour(d: string) {
    setFiltre(null);
    setJour((x) => (x === d ? null : d));
  }
  function toutAfficher() {
    setFiltre(null);
    setJour(null);
  }
  function rafraichir() {
    void chargerTaches();
    void chargerMentions();
  }

  // Fichiers glissés sur une ligne : lus puis remis via la fenêtre habituelle.
  async function deposer(t: TacheMonEspace, fichiers: FileList) {
    setErreur(null);
    try {
      const lus = await Promise.all([...fichiers].slice(0, MAX_PIECES).map((f) => lireFichier(f)));
      setARemettre({ tache: t, pieces: lus.map(({ nom, url }) => ({ nom, url })) });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture du fichier impossible.');
    }
  }

  const ligne = (t: TacheMonEspace, sansProjet = false) => (
    <LigneTache
      key={t.id}
      t={t}
      ton={g.tonDe(t)}
      base={base}
      aujourdhui={aujourdhui}
      sansProjet={sansProjet}
      onOuvrir={(prolongation) => setTiroir({ projetId: t.projetId, tacheId: t.id, prolongation })}
      onRemettre={t.statut === 'remise' ? undefined : () => setARemettre({ tache: t })}
      onDeposer={t.statut === 'remise' ? undefined : (f) => void deposer(t, f)}
    />
  );

  // Tâches à afficher selon le filtre ou le jour (vue par projet, ou jour).
  const selection: TacheMonEspace[] = jour
    ? g.ouvertes.filter((t) => t.echeance === jour)
    : filtre && filtre !== 'mentions'
      ? g[filtre]
      : filtre === 'mentions'
        ? []
        : g.ouvertes;
  const parProjet = groupesParProjet(selection, g.rang);

  return (
    <div className="mt-page">
      <div className="mt-accueil">
        <div>
          <h2 className="mt-accueil-titre">
            {new Date().getHours() >= 18 ? 'Bonsoir' : 'Bonjour'} {utilisateur.prenom}
          </h2>
          <p className="mt-accueil-sous">
            {new Date(`${aujourdhui}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
            {' · '}
            {urgences === 0
              ? 'rien d’urgent aujourd’hui'
              : `${urgences} tâche${urgences > 1 ? 's demandent' : ' demande'} votre attention`}
            {nonLues > 0 && `, ${nonLues} mention${nonLues > 1 ? 's' : ''} à lire`}
          </p>
        </div>
        <div className="vue-toggle" role="group" aria-label="Présentation">
          {(['urgence', 'projet'] as const).map((v) => (
            <button key={v} type="button" className={vue === v ? 'is-active' : ''} aria-pressed={vue === v} onClick={() => choisirVue(v)}>
              {v === 'urgence' ? 'Par urgence' : 'Par projet'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-entete">
        <div className="mt-filtres" role="group" aria-label="Filtrer mes tâches">
          {FILTRES.map((f) => {
            const n = compte[f.cle];
            const actif = filtre === f.cle;
            return (
              <button
                key={f.cle}
                type="button"
                className={`mt-filtre${actif ? ' is-actif' : ''}`}
                data-ton={n > 0 ? f.ton : 'neutre'}
                aria-pressed={actif}
                disabled={!disponible(f.cle)}
                onClick={() => choisirFiltre(f.cle)}
              >
                <span className="mt-filtre-icone" aria-hidden>
                  <f.icone size={16} strokeWidth={2} />
                </span>
                <span className="mt-filtre-texte">
                  <span className="mt-filtre-libelle">{f.libelle}</span>
                  <span className="mt-filtre-aide">{f.cle === 'semaine' ? `d’ici le ${jjmm(g.dimanche)}` : f.aide}</span>
                </span>
                <span className="mt-filtre-compte">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-semaine" role="group" aria-label="Ma semaine : échéances par jour">
          {g.jours.map((j) => {
            const actif = jour === j.date;
            const passe = j.date < aujourdhui;
            return (
              <button
                key={j.date}
                type="button"
                className={`mt-jour${actif ? ' is-actif' : ''}${j.date === aujourdhui ? ' is-aujourdhui' : ''}${passe ? ' is-passe' : ''}`}
                aria-pressed={actif}
                disabled={j.n === 0}
                onClick={() => choisirJour(j.date)}
                title={`${j.n} échéance${j.n > 1 ? 's' : ''} le ${jjmm(j.date)}`}
              >
                <span className="mt-jour-nom">
                  {j.date === aujourdhui ? 'Auj.' : JOURS[jourSemaine(j.date)]} {Number(j.date.slice(8, 10))}
                </span>
                <span className="mt-jour-points" aria-hidden>
                  {Array.from({ length: Math.min(j.n, 4) }, (_, i) => (
                    <span key={i} className="mt-jour-point" />
                  ))}
                  {j.n > 4 && <span className="mt-jour-plus">+{j.n - 4}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {erreur && <p className="field-erreur">{erreur}</p>}

      {nbADecider > 0 && !auMoinsUnFiltre && (
        <div className="mt-bandeau">
          <p>
            <strong>Vous êtes N+1.</strong>{' '}
            {[
              aDecider.taches && `${aDecider.taches} tâche${aDecider.taches > 1 ? 's' : ''} remise${aDecider.taches > 1 ? 's' : ''}`,
              aDecider.absences && `${aDecider.absences} demande${aDecider.absences > 1 ? 's' : ''} d’absence`,
            ]
              .filter(Boolean)
              .join(' et ')}{' '}
            attend{nbADecider > 1 ? 'ent' : ''} votre décision.
          </p>
          <Link className="btn-primary btn-primary--sm" href={`${base}/mon-espace?onglet=a-valider`}>
            Décider
          </Link>
        </div>
      )}

      <section className="panel glass-panel mt-liste" aria-live="polite">
        {auMoinsUnFiltre && (
          <div className="mt-filtre-etat">
            <span>
              {jour
                ? `Échéance le ${new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })} · ${selection.length}`
                : `${filtreActif!.libelle} · ${filtre === 'mentions' ? mentions.length : compte[filtre!]}`}
            </span>
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={toutAfficher}>
              <X size={14} aria-hidden /> Tout afficher
            </button>
          </div>
        )}

        {!auMoinsUnFiltre && urgences === 0 && (
          <p className="mt-calme">Rien d’urgent : aucune reprise, aucun retard, aucune échéance d’ici dimanche.</p>
        )}

        {vue === 'projet' && filtre !== 'mentions'
          ? parProjet.map((p) => (
              <Groupe key={p.projetId} titre={`${p.code} · ${p.client}`} ton="neutre" n={p.taches.length} projet>
                {p.taches.map((t) => ligne(t, true))}
              </Groupe>
            ))
          : jour
            ? (
                <Groupe titre="Échéances du jour" ton="attention" n={selection.length} masquerTitre>
                  {selection.map((t) => ligne(t))}
                </Groupe>
              )
            : (
                <>
                  {(['reprises', 'retards', 'semaine', 'attente'] as const)
                    .filter((f) => filtre === null || filtre === f)
                    .map((f) => (
                      <Groupe key={f} titre={TITRES[f]} ton={FILTRES.find((x) => x.cle === f)!.ton} n={g[f].length} masquerTitre={!!filtre}>
                        {g[f].map((t) => ligne(t))}
                      </Groupe>
                    ))}
                  {filtre === null && g.ensuite.length > 0 && (
                    <details className="mt-plus-tard">
                      <summary>
                        <ChevronDown size={16} aria-hidden className="mt-plus-tard-chevron" />
                        Plus tard · {g.ensuite.length}
                      </summary>
                      <ul className="mt-lignes">{g.ensuite.map((t) => ligne(t))}</ul>
                    </details>
                  )}
                </>
              )}

        {!jour && (filtre === null || filtre === 'mentions') && (
          <Groupe titre="Mentions" ton="iris" n={mentions.length} masquerTitre={filtre === 'mentions'}>
            {mentions.map((m) => (
              <LigneMention
                key={m.id}
                slug={slug}
                m={m}
                onOuvrir={() => (m.tacheId ? setTiroir({ projetId: m.projetId, tacheId: m.tacheId, prolongation: false }) : undefined)}
                base={base}
                onMaj={() => void chargerMentions()}
              />
            ))}
          </Groupe>
        )}
      </section>

      <p className="dmd-note mt-pied">
        <span className="mt-astuce">
          <Paperclip size={13} aria-hidden /> Glissez un fichier sur une tâche pour la remettre.{' '}
        </span>
        Historique et respect des délais :{' '}
        <Link className="lien-inline" href={`${base}/mon-espace?onglet=performances`}>
          Mon espace › Mes performances
        </Link>
        .
      </p>

      {aRemettre && (
        <RemiseModal
          slug={slug}
          tache={aRemettre.tache}
          piecesInitiales={aRemettre.pieces}
          onRemise={setDonnees}
          onClose={() => setARemettre(null)}
        />
      )}
      {tiroir && (
        <TacheDrawer
          key={`${tiroir.tacheId}:${tiroir.prolongation}`}
          slug={slug}
          projetId={tiroir.projetId}
          tacheId={tiroir.tacheId}
          moiId={utilisateur.id}
          prolongation={tiroir.prolongation}
          onMaj={rafraichir}
          onClose={() => setTiroir(null)}
        />
      )}
    </div>
  );
}

const TITRES: Record<Exclude<Filtre, 'mentions'>, string> = {
  reprises: 'À reprendre',
  retards: 'En retard',
  semaine: 'À rendre cette semaine',
  attente: 'En attente de validation',
};

// Vue par projet : un groupe par projet, les plus urgents d'abord.
function groupesParProjet(taches: TacheMonEspace[], rang: (t: TacheMonEspace) => number) {
  const parId = new Map<string, { projetId: string; code: string; client: string; taches: TacheMonEspace[] }>();
  for (const t of taches) {
    const p = parId.get(t.projetId) ?? { projetId: t.projetId, code: t.projetCode, client: t.projetClient, taches: [] };
    p.taches.push(t);
    parId.set(t.projetId, p);
  }
  const groupes = [...parId.values()];
  for (const p of groupes) p.taches.sort((a, b) => rang(a) - rang(b) || parEcheance(a, b));
  return groupes.sort((a, b) => rang(a.taches[0]) - rang(b.taches[0]) || parEcheance(a.taches[0], b.taches[0]));
}

// Barre du haut fixe sur cette page, et sa hauteur réelle (elle passe sur
// deux lignes sur mobile) pour coller les filtres juste en dessous.
function useEnteteFixe() {
  useLayoutEffect(() => {
    const barre = document.querySelector<HTMLElement>('.admin-topbar');
    if (!barre) return;
    const racine = document.documentElement;
    const mesurer = () => racine.style.setProperty('--mt-topbar-h', `${barre.offsetHeight}px`);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(barre);
    return () => {
      obs.disconnect();
      racine.style.removeProperty('--mt-topbar-h');
    };
  }, []);
}

function Groupe({
  titre,
  ton,
  n,
  masquerTitre = false,
  projet = false,
  children,
}: {
  titre: string;
  ton: Ton;
  n: number;
  masquerTitre?: boolean;
  projet?: boolean;
  children: ReactNode;
}) {
  if (n === 0) return null;
  return (
    <div className="mt-groupe">
      {!masquerTitre && (
        <h2 className={`mt-groupe-titre${projet ? ' mt-groupe-titre--projet' : ''}`} data-ton={ton}>
          {titre} <span className="mt-groupe-compte">{n}</span>
        </h2>
      )}
      <ul className="mt-lignes">{children}</ul>
    </div>
  );
}

function LigneTache({
  t,
  ton,
  base,
  aujourdhui,
  sansProjet,
  onOuvrir,
  onRemettre,
  onDeposer,
}: {
  t: TacheMonEspace;
  ton: Ton;
  base: string;
  aujourdhui: string;
  sansProjet: boolean;
  onOuvrir: (prolongation: boolean) => void;
  onRemettre?: () => void;
  onDeposer?: (fichiers: FileList) => void;
}) {
  const [survol, setSurvol] = useState(false);
  const echeance =
    t.statut === 'remise'
      ? { rel: 'En validation', date: `v${String(t.version).padStart(2, '0')}${t.remisLe ? ` · remise le ${jjmm(t.remisLe)}` : ''}` }
      : t.echeance
        ? {
            rel: t.statut === 'a_reprendre' ? `Reprise · ${relatif(t.echeance, aujourdhui).toLowerCase()}` : relatif(t.echeance, aujourdhui),
            date: t.statut === 'a_venir' && t.debut ? `démarre le ${jjmm(t.debut)} · due le ${jjmm(t.echeance)}` : `due le ${jjmm(t.echeance)}`,
          }
        : { rel: 'À planifier', date: 'pas encore de dates' };

  const glisser = onDeposer
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setSurvol(true);
        },
        onDragLeave: () => setSurvol(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setSurvol(false);
          if (e.dataTransfer.files.length) onDeposer(e.dataTransfer.files);
        },
      }
    : {};

  return (
    <li className={`mt-ligne${survol ? ' is-depot' : ''}`} data-ton={ton} {...glisser}>
      <span className="mt-corps">
        <button type="button" className="mt-titre mt-titre-bouton" onClick={() => onOuvrir(false)}>
          {t.libelle}
        </button>
        <span className="mt-meta">
          {!sansProjet && (
            <>
              <Link className="mt-code" href={`${base}/projets?projet=${t.projetId}`}>
                {t.projetCode}
              </Link>
              <span>{t.projetClient}</span>
              <span className="mt-sep" aria-hidden>
                ·
              </span>
            </>
          )}
          <span>{t.etape}</span>
        </span>
        {t.renvoiMotif && (
          <span className="mt-motif">
            <RotateCcw size={13} aria-hidden /> {t.renvoiMotif}
          </span>
        )}
      </span>
      <span className="mt-echeance">
        <span className="mt-echeance-rel">{survol ? 'Déposez pour remettre' : echeance.rel}</span>
        <span className="mt-echeance-date">{echeance.date}</span>
      </span>
      <span className="mt-action">
        {t.statut === 'en_retard' && (
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => onOuvrir(true)}>
            Prolonger
          </button>
        )}
        {onRemettre && (
          <button type="button" className={ton === 'neutre' ? 'btn-ghost btn-ghost--sm' : 'btn-primary btn-primary--sm'} onClick={onRemettre}>
            Remettre
          </button>
        )}
      </span>
    </li>
  );
}

// Mention : lire, répondre dans le fil (l'auteur est mentionné en retour),
// marquer comme lue, ouvrir la tâche.
function LigneMention({ slug, m, base, onOuvrir, onMaj }: { slug: string; m: MentionRecue; base: string; onOuvrir: () => void; onMaj: () => void }) {
  const [reponse, setReponse] = useState<string | null>(null);
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });

  async function agir(action: () => Promise<unknown>) {
    setEtat({ envoi: true, erreur: null });
    try {
      await action();
      setReponse(null);
      setEtat({ envoi: false, erreur: null });
      onMaj();
    } catch (e) {
      setEtat({ envoi: false, erreur: e instanceof ApiError ? e.message : 'Action impossible.' });
    }
  }

  const repondre = () =>
    agir(async () => {
      await publierCommentaire(slug, m.projetId, {
        ...(m.tacheId ? { tacheId: m.tacheId } : { carteId: m.carteId }),
        parentId: m.racineId,
        texte: reponse!.trim(),
        mentionneId: m.auteurId,
      });
      await marquerMentionLue(slug, m.id);
    });

  return (
    <li className={`mt-ligne mt-mention${m.lue ? ' is-lue' : ''}`} data-ton={m.lue ? 'neutre' : 'iris'}>
      <span className="mt-corps">
        <span className="mt-titre">
          {!m.lue && <span className="mt-nouveau" aria-label="Non lue" />}
          {m.auteur ?? 'Quelqu’un'} vous mentionne
        </span>
        <span className="mt-mention-texte">« {m.texte} »</span>
        <span className="mt-meta">
          <Link className="mt-code" href={`${base}/projets?projet=${m.projetId}`}>
            {m.projetCode}
          </Link>
          <span>{m.cible}</span>
        </span>
        {reponse !== null && (
          <span className="mt-reponse">
            <textarea
              className="field-input"
              rows={2}
              maxLength={2000}
              placeholder={`Répondre à ${m.auteur ?? 'l’auteur'}…`}
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
              autoFocus
            />
            <span className="dmd-actions">
              <button type="button" className="btn-ghost btn-ghost--sm" disabled={etat.envoi} onClick={() => setReponse(null)}>
                Annuler
              </button>
              <button type="button" className="btn-primary btn-primary--sm" disabled={etat.envoi || !reponse.trim()} onClick={repondre}>
                Envoyer
              </button>
            </span>
          </span>
        )}
        {etat.erreur && <span className="field-erreur">{etat.erreur}</span>}
      </span>
      <span className="mt-echeance">
        <span className="mt-echeance-rel">le {jjmm(m.creeLe)}</span>
        <span className="mt-echeance-date">{m.lue ? 'lue' : 'non lue'}</span>
      </span>
      <span className="mt-action">
        {reponse === null && (
          <button type="button" className="btn-primary btn-primary--sm" onClick={() => setReponse('')}>
            Répondre
          </button>
        )}
        {!m.lue && reponse === null && (
          <button type="button" className="btn-ghost btn-ghost--sm" disabled={etat.envoi} onClick={() => agir(() => marquerMentionLue(slug, m.id))}>
            Marquer lu
          </button>
        )}
        {m.tacheId && reponse === null && (
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={onOuvrir}>
            Ouvrir
          </button>
        )}
      </span>
    </li>
  );
}
