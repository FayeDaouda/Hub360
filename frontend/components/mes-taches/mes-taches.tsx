'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlarmClock, AtSign, CalendarClock, Hourglass, RotateCcw } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { getAbsencesAValider } from '@/lib/demandes';
import { useTitrePage } from '@/lib/layout-contexte';
import { getMesTaches, getTachesAValider, libelleStatut, STATUT_TACHE } from '@/lib/mon-espace';
import { getNotifications } from '@/lib/notifications';
import type { NotificationItem, StatsPerformances, TacheMonEspace } from '@/lib/types';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { RemiseModal } from '@/components/mon-espace/remise-modal';

type MesTachesApi = { taches: TacheMonEspace[]; stats: StatsPerformances };

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const parEcheance = (a: TacheMonEspace, b: TacheMonEspace) => (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999');
// Mentions gardées en vue : non lues, ou reçues dans les 7 derniers jours.
const FENETRE_MENTIONS_MS = 7 * 86_400_000;

// Dimanche de la semaine en cours (AAAA-MM-JJ) : « dues cette semaine ».
function finDeSemaine(aujourdhui: string): string {
  const d = new Date(`${aujourdhui}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

// « Mes tâches » (revue Salarié, 19/10/2026) : la réponse à « qu'est-ce que
// je dois faire aujourd'hui ? », par urgence — reprises, retards et
// échéances de la semaine, remises en attente, mentions — au lieu de
// chercher entre Projets et Mon espace. Mêmes données que « Mes
// performances » (GET mon-espace/taches), même remise.
export function MesTaches({ slug }: { slug: string }) {
  useTitrePage('Mes tâches');
  const base = `/admin/${slug}`;
  const aujourdhui = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [donnees, setDonnees] = useState<MesTachesApi | null>(null);
  const [mentions, setMentions] = useState<NotificationItem[]>([]);
  const [aDecider, setADecider] = useState({ taches: 0, absences: 0 });
  const [aRemettre, setARemettre] = useState<TacheMonEspace | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

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

  if (!donnees) {
    return erreur ? (
      <p className="empty-state">{erreur}</p>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  const ouvertes = donnees.taches.filter((t) => t.statut !== 'validee').sort(parEcheance);
  const dimanche = finDeSemaine(aujourdhui);
  const reprises = ouvertes.filter((t) => t.statut === 'a_reprendre');
  const retards = ouvertes.filter((t) => t.statut === 'en_retard');
  const semaine = ouvertes.filter((t) => (t.statut === 'en_cours' || t.statut === 'a_venir') && !!t.echeance && t.echeance <= dimanche);
  const attente = ouvertes.filter((t) => t.statut === 'remise');
  const classees = new Set([...reprises, ...retards, ...semaine, ...attente]);
  const ensuite = ouvertes.filter((t) => !classees.has(t));
  const nbADecider = aDecider.taches + aDecider.absences;
  const rienDUrgent = reprises.length + retards.length + semaine.length === 0;

  const ligne = (t: TacheMonEspace, remettre: boolean) => (
    <LigneTache key={t.id} t={t} base={base} aujourdhui={aujourdhui} onRemettre={remettre ? () => setARemettre(t) : undefined} />
  );

  return (
    <>
      <KpiStrip
        tuiles={[
          {
            cle: 'reprises',
            label: 'À reprendre',
            valeur: reprises.length,
            sousTexte: reprises.length ? 'renvoyées par votre N+1, prioritaires' : 'aucune reprise',
            icone: RotateCcw,
            alerte: reprises.length > 0,
            ...(reprises.length > 0 && { action: { type: 'lien' as const, href: '#reprises' } }),
          },
          {
            cle: 'retard',
            label: 'En retard',
            valeur: retards.length,
            sousTexte: retards.length ? 'à remettre au plus vite' : 'aucun retard',
            icone: AlarmClock,
            alerte: retards.length > 0,
            ...(retards.length > 0 && { action: { type: 'lien' as const, href: '#retards' } }),
          },
          {
            cle: 'semaine',
            label: 'Cette semaine',
            valeur: semaine.length,
            sousTexte: `échéance d’ici le ${jjmmaaaa(dimanche)}`,
            icone: CalendarClock,
            ...(semaine.length > 0 && { action: { type: 'lien' as const, href: '#semaine' } }),
          },
          {
            cle: 'attente',
            label: 'En attente de validation',
            valeur: attente.length,
            sousTexte: 'remises chez votre N+1',
            icone: Hourglass,
            ...(attente.length > 0 && { action: { type: 'lien' as const, href: '#attente' } }),
          },
        ]}
      />

      {erreur && <p className="field-erreur">{erreur}</p>}

      {nbADecider > 0 && (
        <section className="panel glass-panel dmd-section">
          <div className="mt-decider">
            <p className="dmd-note">
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
        </section>
      )}

      {rienDUrgent && (
        <section className="panel glass-panel dmd-section">
          <p className="dmd-note">Rien d’urgent : aucune reprise, aucun retard, aucune échéance d’ici dimanche.</p>
        </section>
      )}

      <Section id="reprises" titre="À reprendre" taches={reprises}>
        {reprises.map((t) => ligne(t, true))}
      </Section>
      <Section id="retards" titre="En retard" taches={retards}>
        {retards.map((t) => ligne(t, true))}
      </Section>
      <Section id="semaine" titre="À rendre cette semaine" taches={semaine}>
        {semaine.map((t) => ligne(t, true))}
      </Section>
      <Section id="attente" titre="En attente de validation" taches={attente}>
        {attente.map((t) => ligne(t, false))}
      </Section>

      {mentions.length > 0 && (
        <section id="mentions" className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">
            <AtSign size={16} aria-hidden /> Mentions · {mentions.length}
          </h2>
          <ul className="dmd-liste">
            {mentions.map((n) => (
              <li key={n.id} className="dmd-ligne">
                <span>
                  <strong>{n.titre}</strong>
                  <span className="cell-sub">le {jjmmaaaa(n.date)}</span>
                </span>
                <span className="dmd-actions">
                  {!n.lu && <span className="pill pill--info">Nouveau</span>}
                  {n.projetId && (
                    <Link className="btn-ghost btn-ghost--sm" href={`${base}/projets?projet=${n.projetId}`}>
                      Ouvrir le projet
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ensuite.length > 0 && (
        <details className="panel glass-panel dmd-section mt-ensuite">
          <summary className="dmd-titre">Ensuite · {ensuite.length}</summary>
          <ul className="dmd-liste">{ensuite.map((t) => ligne(t, true))}</ul>
        </details>
      )}

      <p className="dmd-note mt-pied">
        Historique, tâches validées et respect des délais : <Link className="lien-inline" href={`${base}/mon-espace?onglet=performances`}>Mon espace › Mes performances</Link>.
      </p>

      {aRemettre && (
        <RemiseModal slug={slug} tache={aRemettre} onRemise={setDonnees} onClose={() => setARemettre(null)} />
      )}
    </>
  );
}

function Section({ id, titre, taches, children }: { id: string; titre: string; taches: TacheMonEspace[]; children: ReactNode }) {
  if (taches.length === 0) return null;
  return (
    <section id={id} className="panel glass-panel dmd-section">
      <h2 className="dmd-titre">
        {titre} · {taches.length}
      </h2>
      <ul className="dmd-liste">{children}</ul>
    </section>
  );
}

function LigneTache({
  t,
  base,
  aujourdhui,
  onRemettre,
}: {
  t: TacheMonEspace;
  base: string;
  aujourdhui: string;
  onRemettre?: () => void;
}) {
  return (
    <li className="dmd-ligne">
      <span>
        <strong>{t.libelle}</strong>
        <span className="cell-sub">
          <Link className="lien-inline" href={`${base}/projets?projet=${t.projetId}`}>
            {t.projetCode}
          </Link>{' '}
          · {t.projetClient} · {t.etape}
        </span>
        <span className="cell-sub">
          {t.statut === 'remise'
            ? `Remise v${String(t.version).padStart(2, '0')}${t.remisLe ? ` le ${jjmmaaaa(t.remisLe)}` : ''}`
            : t.echeance
              ? `Échéance le ${jjmmaaaa(t.echeance)}`
              : 'Pas encore planifiée'}
        </span>
        {t.renvoiMotif && <span className="cell-sub temps-alerte">« {t.renvoiMotif} »</span>}
      </span>
      <span className="dmd-actions">
        <span className={`pill ${STATUT_TACHE[t.statut].pill}`}>{libelleStatut(t, aujourdhui)}</span>
        {onRemettre && (
          <button type="button" className="btn-primary btn-primary--sm" onClick={onRemettre}>
            Remettre
          </button>
        )}
      </span>
    </li>
  );
}
