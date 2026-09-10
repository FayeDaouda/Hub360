'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlarmClock, CheckCircle2 } from 'lucide-react';
import { getSociete } from '@/lib/api';
import { getMonProfil } from '@/lib/collab';
import { getIndicateurs } from '@/lib/equipe';
import { getAvantProjet, getProjetsExecution } from '@/lib/projets';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import {
  avancementChecklistAvp,
  itemsChecklistAvp,
  NIVEAUX_COLLABORATEUR,
  PHASES,
  type IndicateursCollaborateur,
  type MonProfil,
  type ProjetExecution,
  type Session,
  type Societe,
} from '@/lib/types';
import { CollaborateurShell } from '@/components/collab/collab-shell';
import { KpiStrip, type KpiTuile } from '@/components/admin/kpi-strip';
import { PopupDetail, type LigneDetail } from '@/components/collab/popup-detail';
import { formatDateCourte } from '@/lib/format';

type Props = { params: { slug: string } };

const SEUIL_JOURS = 14; // en deçà, l'échéance est « proche »

type Ligne = {
  projet: ProjetExecution;
  faits: number;
  total: number;
  // avant-projet validé OU toutes les sous-checklists applicables faites
  complete: boolean;
  // jours avant dateFin (négatif = dépassé), null si aucune date
  jours: number | null;
  // brut de l'avant-projet — pour le popup « délais tenus »
  dateFin: string | null;
  valideLe: string | null;
  rang: number;
};

function joursAvant(dateFin: string | null): number | null {
  if (!dateFin) return null;
  const fin = Date.parse(`${dateFin}T23:59:59`);
  if (Number.isNaN(fin)) return null;
  return Math.ceil((fin - Date.now()) / 86_400_000);
}

// 0 en retard · 1 échéance proche · 2 échéance lointaine · 3 sans échéance · 4 fini
function rangUrgence(l: Omit<Ligne, 'rang'>): number {
  if (l.complete) return 4;
  if (l.jours == null) return 3;
  if (l.jours < 0) return 0;
  if (l.jours <= SEUIL_JOURS) return 1;
  return 2;
}

function echClasse(l: Ligne): 'retard' | 'proche' | 'ok' | 'aucune' {
  if (l.jours == null) return 'aucune';
  if (l.jours < 0) return 'retard';
  if (l.jours <= SEUIL_JOURS) return 'proche';
  return 'ok';
}

function echLabel(l: Ligne): string {
  if (l.jours == null) return 'Pas d’échéance';
  if (l.jours < 0) return `En retard de ${-l.jours} j`;
  if (l.jours === 0) return 'Échéance aujourd’hui';
  return `Échéance dans ${l.jours} j`;
}

// Ratio d'avancement checklist (1 = terminé / rien à faire) — tri du popup.
function ratio(l: Pick<Ligne, 'faits' | 'total' | 'complete'>): number {
  if (l.complete) return 1;
  return l.total ? l.faits / l.total : 1;
}

// Accueil collaborateur : point de départ de journée. En-tête + 4 chiffres
// (endpoint indicateurs, étape 4) + « ce qui m'attend » + ses projets actifs
// triés par urgence. Tout dérivé de données existantes, aucune saisie.
export default function CollabPage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const [indic, setIndic] = useState<IndicateursCollaborateur | null>(null);
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [popup, setPopup] = useState<null | 'checklist' | 'delais'>(null);

  useEffect(() => {
    const current = getSession();
    if (!current || current.societe.slug !== params.slug) {
      router.replace(`/login/${params.slug}`);
      return;
    }
    if (current.role !== 'collaborateur') {
      router.replace(destinationForSession(current));
      return;
    }
    setSession(current);
    getSociete(params.slug).then(setSociete).catch(() => setSociete(null));

    // Profil PUIS indicateurs (l'id vient du profil). Un échec de l'un ou de
    // l'autre pose `erreur` — sans quoi le bandeau KPI resterait en squelette
    // indéfiniment (cas d'un compte « collaborateur » sans fiche : mon-profil
    // renvoie 404).
    getMonProfil(params.slug)
      .then((moi) => {
        setProfil(moi);
        return getIndicateurs(params.slug, moi.id);
      })
      .then(setIndic)
      .catch((e) =>
        setErreur(
          e instanceof Error ? e.message : 'Indicateurs indisponibles pour le moment.',
        ),
      );

    getProjetsExecution(params.slug)
      .then(async (projets) => {
        const actifs = projets.filter((p) => p.phase !== 'livre');
        // Fan-out : un avant-projet par projet actif (~poignée d'appels, comme
        // la fiche admin). Sert au tri ET au compteur « ce qui m'attend ».
        const rows = await Promise.all(
          actifs.map(async (projet): Promise<Ligne> => {
            const ap = await getAvantProjet(params.slug, projet.id).catch(() => null);
            const av = ap
              ? avancementChecklistAvp(itemsChecklistAvp(ap.checklists))
              : { faits: 0, total: 0, complete: false };
            const base = {
              projet,
              faits: av.faits,
              total: av.total,
              complete: !!ap?.valideLe || av.complete,
              jours: joursAvant(ap?.dateFin ?? null),
              dateFin: ap?.dateFin ?? null,
              valideLe: ap?.valideLe ?? null,
            };
            return { ...base, rang: rangUrgence(base) };
          }),
        );
        rows.sort(
          (a, b) =>
            a.rang - b.rang ||
            (a.jours ?? Infinity) - (b.jours ?? Infinity) ||
            (a.total ? a.faits / a.total : 1) - (b.total ? b.faits / b.total : 1),
        );
        setLignes(rows);
      })
      .catch(() => setLignes([]));
  }, [params.slug, router]);

  const attention = useMemo(
    () => (lignes ?? []).filter((l) => l.rang <= 1),
    [lignes],
  );
  const enRetard = attention.filter((l) => (l.jours ?? 0) < 0).length;

  if (!session) return null;

  // Tuiles : « en cours » / « livrés » pointent vers un sous-ensemble navigable
  // (lien vers la liste filtrée) ; « délais » / « checklists » cachent un calcul
  // détaillé → popup.
  const projetsBase = `/collab/${params.slug}/projets`;
  const tuiles: KpiTuile[] = indic
    ? [
        {
          cle: 'encours',
          label: 'Projets en cours',
          valeur: indic.projetsEnCours,
          action: { type: 'lien', href: `${projetsBase}?statut=encours` },
        },
        {
          cle: 'livres',
          label: 'Livrés',
          valeur: indic.projetsLivres,
          action: { type: 'lien', href: `${projetsBase}?statut=livres` },
        },
        {
          cle: 'delais',
          label: 'Délais avant-projet tenus',
          valeur: indic.avantProjetDelais.total
            ? `${indic.avantProjetDelais.aTemps}/${indic.avantProjetDelais.total}`
            : '—',
          alerte:
            indic.avantProjetDelais.total > 0 &&
            indic.avantProjetDelais.aTemps < indic.avantProjetDelais.total,
          action: { type: 'popup', onClick: () => setPopup('delais') },
        },
        {
          cle: 'checklist',
          label: 'Avancement checklists',
          valeur: indic.checklistPct == null ? '—' : `${indic.checklistPct} %`,
          alerte: indic.checklistPct != null && indic.checklistPct < 100,
          action: { type: 'popup', onClick: () => setPopup('checklist') },
        },
      ]
    : [];

  // Détail projet par projet des 2 popups — dérivé de `lignes` déjà chargées
  // (aucun appel supplémentaire).
  const lignesChecklist: LigneDetail[] = [...(lignes ?? [])]
    .sort((a, b) => ratio(a) - ratio(b))
    .map((l) => ({
      id: l.projet.id,
      code: l.projet.code,
      programme: l.projet.programme,
      href: `/collab/${params.slug}/projets/${l.projet.id}`,
      valeur: l.complete ? 'Terminé' : `${l.faits}/${l.total}`,
      ton: l.complete ? 'ok' : ratio(l) < 0.5 ? 'alerte' : 'neutre',
    }));

  const lignesDelais: LigneDetail[] = (lignes ?? [])
    .filter((l) => l.dateFin)
    .map((l) => {
      const socle = {
        id: l.projet.id,
        code: l.projet.code,
        programme: l.projet.programme,
        href: `/collab/${params.slug}/projets/${l.projet.id}`,
      };
      if (l.valideLe) {
        const tenu = l.valideLe.slice(0, 10) <= l.dateFin!;
        return {
          ...socle,
          valeur: tenu ? 'Tenu' : 'Dépassé',
          ton: tenu ? 'ok' : 'retard',
          sous: `prévu ${formatDateCourte(l.dateFin!)} · validé ${formatDateCourte(l.valideLe)}`,
        };
      }
      const cl = echClasse(l);
      return {
        ...socle,
        valeur: echLabel(l),
        ton: cl === 'retard' ? 'retard' : cl === 'proche' ? 'alerte' : 'neutre',
        sous: `échéance ${formatDateCourte(l.dateFin!)}`,
      };
    });

  return (
    <CollaborateurShell
      societe={societe}
      session={session}
      active="accueil"
      titre="Accueil"
    >
      <div className="collab-accueil">
        <div className="collab-hero">
          <span
            className="equipe-avatar equipe-avatar--lg"
            style={
              profil?.photoUrl ? { backgroundImage: `url(${profil.photoUrl})` } : undefined
            }
            aria-hidden
          >
            {!profil?.photoUrl &&
              `${session.utilisateur.prenom[0] ?? ''}${session.utilisateur.nom[0] ?? ''}`}
          </span>
          <div className="collab-hero-txt">
            <p className="collab-hero-nom">
              {session.utilisateur.prenom} {session.utilisateur.nom}
            </p>
            {profil ? (
              <p className="collab-hero-meta">
                <span>{profil.role}</span>
                <span className={`equipe-niveau equipe-niveau--${profil.niveau}`}>
                  {NIVEAUX_COLLABORATEUR[profil.niveau]}
                </span>
                <span className="collab-hero-cellule">
                  {profil.celluleNom ?? 'Sans cellule'}
                </span>
              </p>
            ) : erreur ? (
              <p className="collab-hero-meta collab-hero-meta--erreur">{erreur}</p>
            ) : (
              <p className="collab-hero-meta">
                <span className="skeleton collab-hero-skel" aria-hidden />
              </p>
            )}
          </div>
        </div>

        {indic ? (
          <KpiStrip tuiles={tuiles} />
        ) : erreur ? (
          // profil chargé mais indicateurs KO → note à la place du bandeau ;
          // profil KO → le hero porte déjà le message, rien de plus ici.
          profil ? (
            <p className="collab-attente">{erreur}</p>
          ) : null
        ) : (
          <div
            className="skeleton admin-skeleton-panel admin-skeleton-panel--sm"
            aria-hidden
          />
        )}

        {lignes && (
          <p
            id="collab-attente"
            className={`collab-attente${attention.length ? ' collab-attente--actif' : ''}`}
          >
            {attention.length === 0 ? (
              <>
                <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
                Rien d’urgent — tes projets actifs sont dans les temps.
              </>
            ) : (
              <>
                <AlarmClock size={16} strokeWidth={2} aria-hidden />
                <span>
                  <strong>{attention.length}</strong> projet
                  {attention.length > 1 ? 's' : ''}{' '}
                  {attention.length > 1 ? 'demandent' : 'demande'} ton attention
                  {enRetard > 0 && ` · ${enRetard} en retard`}.
                </span>
              </>
            )}
          </p>
        )}

        <div className="collab-section-tete">
          <h3>Mes projets, par priorité</h3>
          <Link href={`/collab/${params.slug}/projets`} className="lien-inline">
            Voir tout{lignes ? ` (${lignes.length})` : ''}
          </Link>
        </div>

        {!lignes ? (
          <div
            className="skeleton admin-skeleton-panel admin-skeleton-panel--sm"
            aria-hidden
          />
        ) : lignes.length === 0 ? (
          <p className="empty-state empty-state--bloc">
            Aucun projet actif ne t’est rattaché pour le moment.
          </p>
        ) : (
          <ul className="collab-worklist collab-worklist--scroll">
            {lignes.map((l) => (
              <li key={l.projet.id}>
                <Link
                  href={`/collab/${params.slug}/projets/${l.projet.id}`}
                  className="collab-worklist-row"
                >
                  <span className="collab-worklist-nom">
                    <span className="collab-worklist-code">{l.projet.code}</span>
                    {l.projet.programme}
                  </span>
                  <span className="collab-worklist-meta">
                    <span className="pill pill--phase">{PHASES[l.projet.phase]}</span>
                    {(l.total > 0 || l.complete) && (
                      <span className={`collab-chk${l.complete ? ' collab-chk--ok' : ''}`}>
                        {l.complete ? 'Checklist ✓' : `Checklist ${l.faits}/${l.total}`}
                      </span>
                    )}
                    {/* L'échéance porte sur l'avant-projet : sans objet une fois bouclé. */}
                    {!l.complete && (
                      <span className={`collab-ech collab-ech--${echClasse(l)}`}>
                        {echLabel(l)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {popup === 'checklist' && (
        <PopupDetail
          titre="Avancement des checklists"
          intro="Sous-checklists opérationnelles de l’avant-projet, projet par projet."
          lignes={lignesChecklist}
          vide="Aucun projet actif."
          onClose={() => setPopup(null)}
        />
      )}
      {popup === 'delais' && (
        <PopupDetail
          titre="Échéances avant-projet"
          intro="Projets en cours datés : échéance vs validation. La tuile, elle, compte aussi les projets livrés (bilan)."
          lignes={lignesDelais}
          vide="Aucun projet en cours n’a de date de fin d’avant-projet."
          onClose={() => setPopup(null)}
        />
      )}
    </CollaborateurShell>
  );
}
