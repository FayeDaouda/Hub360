'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Cog, Search } from 'lucide-react';
import { formatDate, formatTime, todayIso } from '@hub/domain';
import { BoutonExport } from '@/components/bouton-export';
import { dateExport, exporterCsv } from '@/lib/export-csv';
import { ApiError } from '@/lib/client-api';
import { getJournalAudit, type JournalAudit as Journal, type LigneAudit } from '@/lib/pilotage';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Field } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { PersonAvatar } from '@/components/ui/avatar';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PERIODS,
  PERIOD_LABELS,
  SYSTEM_AUTHOR,
  authorsOf,
  countByCategory,
  groupByDay,
  hasActiveFilters,
  matchAuthorAndSearch,
  periodRange,
  rangeError,
  readCriteria,
  splitMotif,
  writeCriteria,
  type JournalCriteria,
} from './journal-filters';

// Traces affichées d'un coup ; « Afficher plus » ajoute la tranche suivante.
const PAGE = 100;
// Au-delà, le détail est replié sur deux lignes (« Voir plus »).
const LONG_DETAIL = 180;

type ErreurLecture = { texte: string; relancer: boolean };

// Période refusée (400) : le message du serveur, en français. Accès refusé
// (403) : dit simplement, sans « Réessayer » qui n'y changerait rien. Le reste
// (panne, coupure réseau, limite de requêtes) : un message humain.
function erreurLecture(e: unknown): ErreurLecture {
  if (e instanceof ApiError && e.status === 400) return { texte: e.message, relancer: false };
  if (e instanceof ApiError && e.status === 403)
    return { texte: 'Vous n’avez pas accès au journal de cette société.', relancer: false };
  return { texte: 'Le journal n’a pas pu être chargé. Vérifiez votre connexion, puis réessayez.', relancer: true };
}

// Pilotage › Journal (CEO, CIO) et Administration du HUB › Journal d'audit :
// qui a fait quoi et quand — comptes, droits, finances, réglages, départs,
// paie, reportings, interventions. Lecture seule. Fil par jour, filtres dans
// l'adresse (?periode=, du=, au=, categorie=, par= ; la recherche, texte libre,
// reste sur l'écran). `entete` à false : la
// page porte déjà le titre et l'explication (Administration du HUB).
export function JournalAudit({ slug, entete = true }: { slug: string; entete?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [criteres, setCriteres] = useState<JournalCriteria>(() => readCriteria(new URLSearchParams(params)));
  const [journal, setJournal] = useState<Journal | null>(null);
  // Dernière lecture terminée (période demandée, erreur éventuelle) : le
  // chargement en cours s'en déduit.
  const [lu, setLu] = useState<{ cle: string; erreur: ErreurLecture | null } | null>(null);
  const [affichees, setAffichees] = useState(PAGE);
  const [essai, setEssai] = useState(0);
  // « Afficher plus » : le focus passe à la première trace ajoutée (le bouton
  // peut disparaître), pas en haut de la page.
  const listeRef = useRef<HTMLOListElement>(null);
  const focusSur = useRef<number | null>(null);
  useEffect(() => {
    if (focusSur.current === null) return;
    listeRef.current?.querySelectorAll<HTMLElement>('.pi-trace')[focusSur.current]?.focus();
    focusSur.current = null;
  }, [affichees]);

  const today = todayIso();
  const periode = periodRange(criteres, today);
  const erreurPeriode = criteres.period === 'perso' ? rangeError(periode.from, periode.to) : null;

  // L'adresse suit les critères, sans entrée d'historique. `null` : le routeur
  // de Next prend l'adresse en compte (useSearchParams, retour sur l'onglet).
  // Une navigation de Next (lien, notification) la change : les critères suivent.
  const ecrit = useRef<string | null>(null);
  useEffect(() => {
    const suivante = writeCriteria(new URLSearchParams(window.location.search), criteres).toString();
    ecrit.current = suivante;
    if (suivante === window.location.search.replace(/^\?/, '')) return;
    try {
      window.history.replaceState(null, '', `${pathname}${suivante ? `?${suivante}` : ''}`);
    } catch {
      // Navigateur qui limite les appels (Safari) : l'écran reste juste.
    }
  }, [criteres, pathname]);
  useEffect(() => {
    const lue = params.toString();
    if (ecrit.current !== null && lue !== ecrit.current) setCriteres(readCriteria(new URLSearchParams(lue)));
  }, [params]);

  // Période : demandée au serveur ; la dernière demande seule compte.
  const cle = `${slug}|${periode.from}|${periode.to}|${essai}`;
  useEffect(() => {
    if (erreurPeriode) return;
    let annule = false;
    getJournalAudit(slug, periode.from, periode.to)
      .then((j) => {
        if (annule) return;
        setJournal(j);
        setAffichees(PAGE);
        setLu({ cle, erreur: null });
      })
      .catch((e) => !annule && setLu({ cle, erreur: erreurLecture(e) }));
    return () => {
      annule = true;
    };
  }, [cle, slug, periode.from, periode.to, erreurPeriode]);
  const chargement = !erreurPeriode && lu?.cle !== cle;
  const erreur = lu?.cle === cle ? lu.erreur : null;

  const changer = useCallback((maj: Partial<JournalCriteria>) => {
    setCriteres((c) => ({ ...c, ...maj }));
    setAffichees(PAGE);
  }, []);

  const lignes = useMemo(() => journal?.lignes ?? [], [journal]);
  const auteurs = useMemo(() => authorsOf(lignes), [lignes]);
  const avantCategorie = useMemo(() => matchAuthorAndSearch(lignes, criteres), [lignes, criteres]);
  const visibles = useMemo(
    () => avantCategorie.filter((l) => criteres.category === 'toutes' || l.categorie === criteres.category),
    [avantCategorie, criteres.category],
  );
  const jours = useMemo(() => groupByDay(visibles.slice(0, affichees), today), [visibles, affichees, today]);
  const nombres = useMemo(() => countByCategory(avantCategorie), [avantCategorie]);

  const Titre = entete ? 'h3' : 'h2';
  const filtres = hasActiveFilters(criteres);
  const restantes = visibles.length - affichees;
  // Fil affiché seulement pour une période lisible (pas celui de la précédente).
  const fil = !!journal && !erreurPeriode && !erreur;
  // Les outils restent en place pendant le premier chargement ; le squelette
  // tient la place du fil.
  const premierChargement = !journal && !erreurPeriode && !erreur;

  return (
    <section
      className="panel glass-panel pi-journal"
      aria-label={entete ? undefined : 'Journal d’audit'}
      aria-busy={chargement || undefined}
    >
      {entete && (
        <>
          <h2>Journal d’audit</h2>
          <p className="pi-aide">
            Traces enregistrées par le HUB, jamais modifiables. Une consultation couvre un an au plus.
          </p>
        </>
      )}

      <div className="pi-journal-outils">
        <div className="pi-periodes" role="group" aria-label="Période">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={criteres.period === p ? 'is-active' : ''}
              aria-pressed={criteres.period === p}
              onClick={() =>
                changer(
                  // « Dates… » part de la période affichée, à ajuster.
                  p === 'perso' && criteres.period !== 'perso'
                    ? { period: p, from: periode.from, to: periode.to }
                    : { period: p },
                )
              }
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <label className="champ-recherche pi-journal-recherche">
          <Search size={16} aria-hidden />
          <input
            type="search"
            className="field-input"
            placeholder="Action, nom, détail…"
            aria-label="Rechercher dans le journal"
            value={criteres.search}
            onChange={(e) => changer({ search: e.target.value })}
          />
        </label>
        <select
          className="field-input pi-journal-auteur"
          aria-label="Auteur"
          value={criteres.author}
          onChange={(e) => changer({ author: e.target.value })}
        >
          <option value="">Tout le monde</option>
          {/* Auteur choisi (lien partagé) absent de la période : gardé visible. */}
          {criteres.author && !auteurs.includes(criteres.author) && (
            <option value={criteres.author}>{criteres.author}</option>
          )}
          {auteurs.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <BoutonExport
          // Le fichier porte les dates réellement lues, jamais celles d'une
          // période en cours de chargement ou en échec.
          desactive={!fil || chargement || !visibles.length}
          onExporter={() => journal && exporter(visibles, journal)}
        />
      </div>

      {criteres.period === 'perso' && (
        <div className="pi-journal-dates">
          <Field label="Du">
            <input
              className="field-input"
              type="date"
              value={criteres.from}
              max={criteres.to || undefined}
              onChange={(e) => changer({ from: e.target.value })}
            />
          </Field>
          <Field label="Au">
            <input
              className="field-input"
              type="date"
              value={criteres.to}
              min={criteres.from || undefined}
              onChange={(e) => changer({ to: e.target.value })}
            />
          </Field>
          {erreurPeriode && (
            <p className="field-erreur pi-journal-dates-erreur" role="alert">
              {erreurPeriode}
            </p>
          )}
        </div>
      )}

      <div className="fin-filtres pi-journal-categories" role="group" aria-label="Catégorie">
        <button
          type="button"
          className={criteres.category === 'toutes' ? 'is-active' : ''}
          aria-pressed={criteres.category === 'toutes'}
          onClick={() => changer({ category: 'toutes' })}
        >
          {/* Nombres seulement pour une période lue : jamais ceux d'une autre. */}
          Tout {fil && <span className="pi-cat-nombre">{avantCategorie.length}</span>}
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`pi-cat pi-cat--${c}${criteres.category === c ? ' is-active' : ''}${fil && !nombres[c] ? ' is-vide' : ''}`}
            aria-pressed={criteres.category === c}
            onClick={() => changer({ category: c })}
          >
            <span className="pi-cat-point" aria-hidden />
            {CATEGORY_LABELS[c]} {fil && <span className="pi-cat-nombre">{nombres[c]}</span>}
          </button>
        ))}
      </div>

      <div className="pi-journal-resume">
        <span role="status" aria-live="polite">
          {chargement && !erreurPeriode
            ? 'Chargement…'
            : fil &&
              `${visibles.length} trace${visibles.length > 1 ? 's' : ''}${filtres ? ` sur ${lignes.length}` : ''} · du ${formatDate(journal.debut)} au ${formatDate(journal.fin)}`}
        </span>
        {/* Liste vide : le bouton est sous le message, pas en double ici. */}
        {filtres && !(fil && visibles.length === 0) && (
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            onClick={() => changer({ category: 'toutes', author: '', search: '' })}
          >
            Effacer les filtres
          </button>
        )}
      </div>

      {erreur && (
        // Lecture d'une autre période en échec : pas les traces de la
        // précédente sous le nouveau bouton actif, et de quoi relancer.
        <div className="pi-journal-erreur" role="alert">
          <p>{erreur.texte}</p>
          {erreur.relancer && (
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setEssai((n) => n + 1)}>
              Réessayer
            </button>
          )}
        </div>
      )}

      {premierChargement ? (
        <div aria-busy="true" aria-label="Chargement du journal">
          <Skeleton />
        </div>
      ) : !fil ? null : visibles.length === 0 ? (
        <div className="pi-journal-vide">
          <EmptyState>
            {filtres ? 'Aucune trace ne correspond à ces filtres.' : 'Aucune trace sur cette période.'}
          </EmptyState>
          {filtres && (
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              onClick={() => changer({ category: 'toutes', author: '', search: '' })}
            >
              Effacer les filtres
            </button>
          )}
        </div>
      ) : (
        <ol ref={listeRef} className="pi-jours">
          {jours.map((j) => (
            <li key={j.day} className="pi-jour">
              <Titre className="pi-jour-titre">{j.title}</Titre>
              <ul className="pi-traces">
                {j.lines.map((l) => (
                  <Trace key={l.id} ligne={l} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {fil && restantes > 0 && (
        <div className="pi-journal-suite">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              focusSur.current = affichees;
              setAffichees((n) => n + PAGE);
            }}
          >
            Afficher plus ({restantes} restante{restantes > 1 ? 's' : ''})
          </button>
        </div>
      )}

      <p className="pi-journal-note">Traces jamais modifiables. Une consultation couvre un an au plus.</p>
    </section>
  );
}

function Trace({ ligne }: { ligne: LigneAudit }) {
  const [ouvert, setOuvert] = useState(false);
  const { detail, motif } = splitMotif(ligne.detail);
  const long = detail.length > LONG_DETAIL;
  return (
    <li className="pi-trace" tabIndex={-1}>
      <time className="pi-trace-heure" dateTime={ligne.le}>
        {formatTime(ligne.le)}
      </time>
      {ligne.par ? (
        <PersonAvatar name={ligne.par} size="xs" className="pi-trace-avatar" />
      ) : (
        <span className="av av--xs pi-trace-avatar pi-trace-hub" aria-hidden>
          <Cog size={13} />
        </span>
      )}
      <div className="pi-trace-corps">
        <p className="pi-trace-titre">
          <strong>{ligne.action}</strong>
          <Pill tone={`cat-journal-${ligne.categorie}`}>{CATEGORY_LABELS[ligne.categorie]}</Pill>
        </p>
        {detail && <p className={`pi-trace-detail${long && !ouvert ? ' is-replie' : ''}`}>{detail}</p>}
        {long && (
          <button type="button" className="pi-trace-plus" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
            {ouvert ? 'Voir moins' : 'Voir plus'}
          </button>
        )}
        {motif && (
          <p className="pi-trace-motif">
            <span>Motif</span> {motif}
          </p>
        )}
      </div>
      <span className="pi-trace-par">{ligne.par ?? SYSTEM_AUTHOR}</span>
    </li>
  );
}

function exporter(lignes: LigneAudit[], j: Journal) {
  exporterCsv(
    `journal-audit-${j.debut}-${j.fin}`,
    [
      { titre: 'Date', valeur: (l) => dateExport(l.le) },
      { titre: 'Heure', valeur: (l) => formatTime(l.le) },
      { titre: 'Catégorie', valeur: (l) => CATEGORY_LABELS[l.categorie] },
      { titre: 'Action', valeur: (l) => l.action },
      { titre: 'Détail', valeur: (l) => l.detail },
      { titre: 'Par', valeur: (l) => l.par ?? SYSTEM_AUTHOR },
    ],
    lignes,
  );
}
