'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlarmClock, CheckCircle2, FolderKanban, Gauge, PlayCircle } from 'lucide-react';
import { ActionsRapides, type ActionRapide } from '@/components/actions-rapides';
import { RailAccueil } from '@/components/collab/rail-accueil';
import { getMonProfil } from '@/lib/collab';
import { getIndicateurs } from '@/lib/equipe';
import { getAvantProjet, getProjetsExecution } from '@/lib/projets';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import {
  avancementChecklistFichiers,
  itemsChecklistAvp,
  NIVEAUX_COLLABORATEUR,
  PHASES,
  type IndicateursCollaborateur,
  type MonProfil,
  type ProjetExecution,
} from '@/lib/types';
import { KpiStrip, type KpiTuile } from '@/components/admin/kpi-strip';

type Props = { params: { slug: string } };

// Même palette de dégradés que le tableau de bord admin, CRM, Projets et
// Facturation (demande boss, sept. 2026) — cohérence de traitement des KPI
// dans toute l'appli, y compris côté collaborateur.
const DEGRADE_KPI: Record<string, { a: string; b: string }> = {
  encours: { a: '#2e3192', b: '#1bffff' }, // Ocean Blue
  livres: { a: '#11998e', b: '#38ef7d' }, // Quepal
  retard: { a: '#ff5f6d', b: '#ffc371' }, // Sweet Morning
  checklist: { a: '#764ba2', b: '#667eea' }, // Plum Plate
};

const SEUIL_JOURS = 14; // en deçà, l'échéance est « proche »

type Ligne = {
  projet: ProjetExecution;
  faits: number;
  total: number;
  // avant-projet validé OU toutes les sous-checklists applicables faites
  complete: boolean;
  // jours avant dateFin (négatif = dépassé), null si aucune date
  jours: number | null;
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

// Accueil collaborateur : point de départ de journée. En-tête + 4 chiffres
// (endpoint indicateurs, étape 4) + « ce qui m'attend » + ses projets actifs
// triés par urgence. Tout dérivé de données existantes, aucune saisie.
export default function CollabPage({ params }: Props) {
  useTitrePage('Accueil');
  const session = useSessionCourante();
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const [indic, setIndic] = useState<IndicateursCollaborateur | null>(null);
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
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
              ? avancementChecklistFichiers(itemsChecklistAvp(ap.checklists))
              : { faits: 0, total: 0, complete: false };
            const base = {
              projet,
              faits: av.faits,
              total: av.total,
              complete: av.complete,
              jours: joursAvant(ap?.dateFin ?? null),
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
  }, [params.slug]);

  const attention = useMemo(
    () => (lignes ?? []).filter((l) => l.rang <= 1),
    [lignes],
  );
  const enRetard = attention.filter((l) => (l.jours ?? 0) < 0).length;

  // Raccourcis : les 2 destinations réelles + « reprendre » sur le projet le
  // plus prioritaire — mais seulement s'il reste vraiment quelque chose à
  // reprendre. `lignes` est trié par urgence croissante (rang 4 = fini) ; si
  // le premier est déjà complet, TOUS le sont (sinon il serait derrière un
  // rang < 4) — zéro projet actif et « tout est bouclé » doivent tous les
  // deux se comporter pareil : pas de raccourci « Reprendre » trompeur.
  const urgent = lignes?.find((l) => !l.complete);
  const actions: ActionRapide[] = [
    ...(urgent
      ? [
          {
            cle: 'reprendre',
            icone: PlayCircle,
            label: `Reprendre — ${urgent.projet.programme}`,
            href: `/collab/${params.slug}/projets/${urgent.projet.id}`,
          },
        ]
      : []),
    {
      cle: 'projets',
      icone: FolderKanban,
      label: 'Mes projets',
      href: `/collab/${params.slug}/projets`,
    },
    {
      cle: 'indicateurs',
      icone: Gauge,
      label: 'Mes indicateurs',
      href: `/collab/${params.slug}/indicateurs`,
    },
  ];

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
          degrade: DEGRADE_KPI.encours,
          action: { type: 'lien', href: `${projetsBase}?statut=encours` },
        },
        {
          cle: 'livres',
          label: 'Livrés',
          valeur: indic.projetsLivres,
          degrade: DEGRADE_KPI.livres,
          action: { type: 'lien', href: `${projetsBase}?statut=livres` },
        },
        {
          // Lien plutôt que popup (contrairement aux 2 tuiles ci-dessus) :
          // le détail tâche par tâche, tous modules confondus, vit sur
          // « Mes indicateurs », pas dans une popup dérivée de `lignes`
          // (qui reste un worklist par PROJET, pas par tâche individuelle).
          cle: 'retard',
          label: 'Tâches en retard',
          valeur: indic.mesTaches.enRetard,
          degrade: DEGRADE_KPI.retard,
          action: { type: 'lien', href: `/collab/${params.slug}/indicateurs` },
        },
        {
          cle: 'checklist',
          label: 'Mes tâches complétées',
          valeur: indic.mesTaches.pct == null ? '—' : `${indic.mesTaches.pct} %`,
          degrade: DEGRADE_KPI.checklist,
          action: { type: 'lien', href: `/collab/${params.slug}/indicateurs` },
        },
      ]
    : [];

  return (
    <>
      <div className="collab-accueil collab-accueil--2col">
        <div className="collab-accueil-main">
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

        <ActionsRapides actions={actions} />

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

        <RailAccueil slug={params.slug} pourcentage={indic?.mesTaches.pct ?? null} />
      </div>
    </>
  );
}
