'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlarmClock, AtSign, CalendarClock, ChevronDown, Hourglass, RotateCcw, X, type LucideIcon } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { getAbsencesAValider } from '@/lib/demandes';
import { useTitrePage } from '@/lib/layout-contexte';
import { ecartJours, getMesTaches, getTachesAValider } from '@/lib/mon-espace';
import { getNotifications } from '@/lib/notifications';
import type { NotificationItem, StatsPerformances, TacheMonEspace } from '@/lib/types';
import { RemiseModal } from '@/components/mon-espace/remise-modal';

type MesTachesApi = { taches: TacheMonEspace[]; stats: StatsPerformances };
type Filtre = 'reprises' | 'retards' | 'semaine' | 'attente' | 'mentions';
// Ton de couleur (tokens --pill-*) : bande de la ligne, compteur du filtre.
type Ton = 'risque' | 'attention' | 'info' | 'iris' | 'neutre';

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const parEcheance = (a: TacheMonEspace, b: TacheMonEspace) => (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999');
// Mentions gardées en vue : non lues, ou reçues dans les 7 derniers jours.
const FENETRE_MENTIONS_MS = 7 * 86_400_000;

// Dimanche de la semaine en cours (AAAA-MM-JJ) : « dues cette semaine ».
function finDeSemaine(aujourdhui: string): string {
  const d = new Date(`${aujourdhui}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

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
  { cle: 'mentions', libelle: 'Mentions', aide: 'dans les fils des projets', icone: AtSign, ton: 'iris' },
];

// « Mes tâches » (revue Salarié, 19/10/2026) : la réponse à « qu'est-ce que
// je dois faire aujourd'hui ? », par urgence. En-tête fixe (barre du haut +
// filtres) ; un filtre n'affiche que sa liste, un second clic rend tout.
// Mêmes données que « Mes performances » (GET mon-espace/taches), même remise.
export function MesTaches({ slug }: { slug: string }) {
  useTitrePage('Mes tâches');
  const base = `/admin/${slug}`;
  const aujourdhui = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [donnees, setDonnees] = useState<MesTachesApi | null>(null);
  const [mentions, setMentions] = useState<NotificationItem[]>([]);
  const [aDecider, setADecider] = useState({ taches: 0, absences: 0 });
  const [filtreChoisi, setFiltre] = useState<Filtre | null>(null);
  const [aRemettre, setARemettre] = useState<TacheMonEspace | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEnteteFixe();

  const charger = useCallback(() => {
    getMesTaches(slug)
      .then(setDonnees)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger vos tâches.'));
    // Compléments : leur échec ne bloque pas la liste des tâches.
    getNotifications(slug)
      .then((f) => {
        const depuis = Date.now() - FENETRE_MENTIONS_MS;
        setMentions(f.elements.filter((n) => n.type === 'mention_projet' && (!n.lu || Date.parse(n.date) >= depuis)));
      })
      .catch(() => setMentions([]));
    Promise.all([getTachesAValider(slug), getAbsencesAValider(slug)])
      .then(([t, a]) => setADecider({ taches: t.length, absences: a.length }))
      .catch(() => setADecider({ taches: 0, absences: 0 }));
  }, [slug]);
  useEffect(charger, [charger]);

  const groupes = useMemo(() => {
    const ouvertes = (donnees?.taches ?? []).filter((t) => t.statut !== 'validee').sort(parEcheance);
    const dimanche = finDeSemaine(aujourdhui);
    const reprises = ouvertes.filter((t) => t.statut === 'a_reprendre');
    const retards = ouvertes.filter((t) => t.statut === 'en_retard');
    const semaine = ouvertes.filter((t) => (t.statut === 'en_cours' || t.statut === 'a_venir') && !!t.echeance && t.echeance <= dimanche);
    const attente = ouvertes.filter((t) => t.statut === 'remise');
    const classees = new Set([...reprises, ...retards, ...semaine, ...attente]);
    return { reprises, retards, semaine, attente, ensuite: ouvertes.filter((t) => !classees.has(t)), dimanche };
  }, [donnees, aujourdhui]);
  const compte: Record<Filtre, number> = {
    reprises: groupes.reprises.length,
    retards: groupes.retards.length,
    semaine: groupes.semaine.length,
    attente: groupes.attente.length,
    mentions: mentions.length,
  };
  // Un filtre dont la liste s'est vidée (dernière tâche remise) rend « tout ».
  const filtre = filtreChoisi && compte[filtreChoisi] > 0 ? filtreChoisi : null;

  if (!donnees) {
    return erreur ? (
      <p className="empty-state">{erreur}</p>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  const voir = (f: Filtre) => filtre === null || filtre === f;
  const nbADecider = aDecider.taches + aDecider.absences;
  const urgences = compte.reprises + compte.retards + compte.semaine;
  const ligne = (t: TacheMonEspace, ton: Ton) => (
    <LigneTache key={t.id} t={t} ton={ton} base={base} aujourdhui={aujourdhui} onRemettre={t.statut === 'remise' ? undefined : () => setARemettre(t)} />
  );
  const filtreActif = FILTRES.find((f) => f.cle === filtre);

  return (
    <div className="mt-page">
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
                disabled={n === 0}
                onClick={() => setFiltre(actif ? null : f.cle)}
              >
                <span className="mt-filtre-icone" aria-hidden>
                  <f.icone size={16} strokeWidth={2} />
                </span>
                <span className="mt-filtre-texte">
                  <span className="mt-filtre-libelle">{f.libelle}</span>
                  <span className="mt-filtre-aide">{f.cle === 'semaine' ? `d’ici le ${jjmm(groupes.dimanche)}` : f.aide}</span>
                </span>
                <span className="mt-filtre-compte">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {erreur && <p className="field-erreur">{erreur}</p>}

      {nbADecider > 0 && filtre === null && (
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
        {filtreActif && (
          <div className="mt-filtre-etat">
            <span>
              {filtreActif.libelle} · {compte[filtreActif.cle]}
            </span>
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setFiltre(null)}>
              <X size={14} aria-hidden /> Tout afficher
            </button>
          </div>
        )}

        {filtre === null && urgences === 0 && (
          <p className="mt-calme">Rien d’urgent : aucune reprise, aucun retard, aucune échéance d’ici dimanche.</p>
        )}

        {voir('reprises') && (
          <Groupe titre="À reprendre" ton="risque" n={compte.reprises} masquerTitre={!!filtre}>
            {groupes.reprises.map((t) => ligne(t, 'risque'))}
          </Groupe>
        )}
        {voir('retards') && (
          <Groupe titre="En retard" ton="risque" n={compte.retards} masquerTitre={!!filtre}>
            {groupes.retards.map((t) => ligne(t, 'risque'))}
          </Groupe>
        )}
        {voir('semaine') && (
          <Groupe titre="À rendre cette semaine" ton="attention" n={compte.semaine} masquerTitre={!!filtre}>
            {groupes.semaine.map((t) => ligne(t, 'attention'))}
          </Groupe>
        )}
        {voir('attente') && (
          <Groupe titre="En attente de validation" ton="info" n={compte.attente} masquerTitre={!!filtre}>
            {groupes.attente.map((t) => ligne(t, 'info'))}
          </Groupe>
        )}
        {voir('mentions') && (
          <Groupe titre="Mentions" ton="iris" n={compte.mentions} masquerTitre={!!filtre}>
            {mentions.map((n) => (
              <li key={n.id} className="mt-ligne" data-ton="iris">
                <span className="mt-corps">
                  <span className="mt-titre">
                    {!n.lu && <span className="mt-nouveau" aria-label="Non lue" />}
                    {n.titre}
                  </span>
                </span>
                <span className="mt-echeance">
                  <span className="mt-echeance-rel">le {jjmm(n.date)}</span>
                </span>
                <span className="mt-action">
                  {n.projetId && (
                    <Link className="btn-ghost btn-ghost--sm" href={`${base}/projets?projet=${n.projetId}`}>
                      Ouvrir
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </Groupe>
        )}

        {filtre === null && groupes.ensuite.length > 0 && (
          <details className="mt-plus-tard">
            <summary>
              <ChevronDown size={16} aria-hidden className="mt-plus-tard-chevron" />
              Plus tard · {groupes.ensuite.length}
            </summary>
            <ul className="mt-lignes">{groupes.ensuite.map((t) => ligne(t, 'neutre'))}</ul>
          </details>
        )}
      </section>

      <p className="dmd-note mt-pied">
        Historique, tâches validées et respect des délais :{' '}
        <Link className="lien-inline" href={`${base}/mon-espace?onglet=performances`}>
          Mon espace › Mes performances
        </Link>
        .
      </p>

      {aRemettre && <RemiseModal slug={slug} tache={aRemettre} onRemise={setDonnees} onClose={() => setARemettre(null)} />}
    </div>
  );
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

function Groupe({ titre, ton, n, masquerTitre, children }: { titre: string; ton: Ton; n: number; masquerTitre: boolean; children: ReactNode }) {
  if (n === 0) return null;
  return (
    <div className="mt-groupe">
      {!masquerTitre && (
        <h2 className="mt-groupe-titre" data-ton={ton}>
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
  onRemettre,
}: {
  t: TacheMonEspace;
  ton: Ton;
  base: string;
  aujourdhui: string;
  onRemettre?: () => void;
}) {
  const echeance =
    t.statut === 'remise'
      ? { rel: 'En validation', date: `v${String(t.version).padStart(2, '0')}${t.remisLe ? ` · remise le ${jjmm(t.remisLe)}` : ''}` }
      : t.echeance
        ? {
            rel: relatif(t.echeance, aujourdhui),
            date: t.statut === 'a_venir' && t.debut ? `démarre le ${jjmm(t.debut)} · due le ${jjmm(t.echeance)}` : `due le ${jjmm(t.echeance)}`,
          }
        : { rel: 'À planifier', date: 'pas encore de dates' };
  return (
    <li className="mt-ligne" data-ton={ton}>
      <span className="mt-corps">
        <span className="mt-titre">{t.libelle}</span>
        <span className="mt-meta">
          <Link className="mt-code" href={`${base}/projets?projet=${t.projetId}`}>
            {t.projetCode}
          </Link>
          <span>{t.projetClient}</span>
          <span className="mt-sep" aria-hidden>
            ·
          </span>
          <span>{t.etape}</span>
        </span>
        {t.renvoiMotif && (
          <span className="mt-motif">
            <RotateCcw size={13} aria-hidden /> {t.renvoiMotif}
          </span>
        )}
      </span>
      <span className="mt-echeance">
        <span className="mt-echeance-rel">{echeance.rel}</span>
        <span className="mt-echeance-date">{echeance.date}</span>
      </span>
      <span className="mt-action">
        {onRemettre && (
          <button type="button" className={ton === 'neutre' ? 'btn-ghost btn-ghost--sm' : 'btn-primary btn-primary--sm'} onClick={onRemettre}>
            Remettre
          </button>
        )}
      </span>
    </li>
  );
}
