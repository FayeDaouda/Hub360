'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Boxes,
  Briefcase,
  Building2,
  Home,
  Map as MapIcon,
  Printer,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { getSociete } from '@/lib/api';
import { getMonProfil } from '@/lib/collab';
import { getIndicateurs } from '@/lib/equipe';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import {
  NIVEAUX_COLLABORATEUR,
  PHASES,
  TYPES_BIEN,
  type IndicateursCollaborateur,
  type LigneProjetIndic,
  type MonProfil,
  type Session,
  type Societe,
  type TypeBien,
} from '@/lib/types';
import { CollaborateurShell } from '@/components/collab/collab-shell';
import { RadialGauge } from '@/components/admin/radial-gauge';

type Props = { params: { slug: string } };

// Icône générique par type de bien — repère visuel en attendant les vignettes
// de portfolio. Aucune donnée nouvelle : projet.type existe déjà.
const ICONE_BIEN: Record<TypeBien, LucideIcon> = {
  villa: Home,
  immeuble: Building2,
  lotissement: MapIcon,
  bureaux: Briefcase,
  commerce: Store,
  mixte: Boxes,
};

const moisAnnee = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

// Ancienneté en clair à partir d'une date AAAA-MM-JJ. Rendu discret
// (« 2 ans et 6 mois »), jamais un score.
function anciennete(depuis: string): string {
  const d = new Date(`${depuis}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  let mois =
    (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) mois -= 1;
  if (mois < 0) return '';
  if (mois < 1) return 'depuis ce mois-ci';
  if (mois < 12) return `${mois} mois`;
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  const a = `${ans} an${ans > 1 ? 's' : ''}`;
  return reste ? `${a} et ${reste} mois` : a;
}

// « Avant-projet dans les délais » — l'unique mesure : sa date de validation
// contre son échéance. Aucune date de livraison réelle n'existe.
function delaiAvantProjet(l: LigneProjetIndic): {
  texte: string;
  ton: 'ok' | 'alerte' | 'neutre';
} {
  if (!l.apValideLe || !l.apDateFin) {
    return { texte: 'Avant-projet non daté', ton: 'neutre' };
  }
  return l.apValideLe.slice(0, 10) <= l.apDateFin
    ? { texte: 'Avant-projet dans les délais', ton: 'ok' }
    : { texte: 'Avant-projet hors délais', ton: 'alerte' };
}

// « Mes indicateurs » — page « mon parcours », pas un second tableau de bord.
// Tout est calcul de lecture serveur (endpoint indicateurs) : aucune saisie
// côté collaborateur, aucun score agrégé, aucune comparaison entre personnes.
export default function IndicateursPage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const [indic, setIndic] = useState<IndicateursCollaborateur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

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
  }, [params.slug, router]);

  if (!session) return null;

  const projetBase = `/collab/${params.slug}/projets`;
  const del = indic?.avantProjetDelais;
  // Moyenne « avancement checklists » : sur les projets actifs qui ONT une checklist.
  const nChecklist = (indic?.projetsActifs ?? []).filter(
    (p) => p.checklistPct != null,
  ).length;

  return (
    <CollaborateurShell
      societe={societe}
      session={session}
      active="indicateurs"
      titre="Mes indicateurs"
    >
      <div className="indic">
        <div className="indic-actions">
          <p className="indic-intro">
            Ton parcours dans le studio — projets, checklists, délais d’avant-projet.
            Aucune note, aucun classement.
          </p>
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            onClick={() => window.print()}
          >
            <Printer size={15} strokeWidth={2} aria-hidden />
            <span>Imprimer / enregistrer en PDF</span>
          </button>
        </div>

        {/* En-tête « carte de visite » */}
        <header className="indic-carte">
          <span
            className="indic-avatar"
            style={
              profil?.photoUrl ? { backgroundImage: `url(${profil.photoUrl})` } : undefined
            }
            aria-hidden
          >
            {!profil?.photoUrl &&
              `${session.utilisateur.prenom[0] ?? ''}${session.utilisateur.nom[0] ?? ''}`}
          </span>
          <div className="indic-carte-txt">
            <p className="indic-carte-nom">
              {session.utilisateur.prenom} {session.utilisateur.nom}
            </p>
            {profil ? (
              <>
                <p className="indic-carte-meta">
                  <span>{profil.role}</span>
                  <span className={`equipe-niveau equipe-niveau--${profil.niveau}`}>
                    {NIVEAUX_COLLABORATEUR[profil.niveau]}
                  </span>
                  <span className="indic-carte-cellule">
                    {profil.celluleNom ?? 'Sans cellule'}
                  </span>
                </p>
                {profil.dateArrivee && anciennete(profil.dateArrivee) && (
                  <p className="indic-carte-anc">
                    Dans l’équipe depuis{' '}
                    {moisAnnee.format(new Date(`${profil.dateArrivee}T00:00:00`))} ·{' '}
                    {anciennete(profil.dateArrivee)}
                  </p>
                )}
              </>
            ) : erreur ? (
              <p className="indic-carte-meta indic-carte-meta--err">{erreur}</p>
            ) : (
              <p className="indic-carte-meta">
                <span className="skeleton indic-skel" aria-hidden />
              </p>
            )}
          </div>
        </header>

        {!indic ? (
          erreur ? (
            <p className="empty-state empty-state--bloc">{erreur}</p>
          ) : (
            <div
              className="skeleton admin-skeleton-panel admin-skeleton-panel--sm"
              aria-hidden
            />
          )
        ) : (
          <>
            {/* Deux anneaux de progression — réels différenciateurs ? non : ils
                doublent l'accueil. Gardés parce que la spec les demande, mais
                discrets (ratio en sous-texte, pas de gros %). */}
            <section className="indic-anneaux">
              <RadialGauge
                data={{ pourcentage: indic.checklistPct ?? 0 }}
                libelle="Avancement checklists"
                ton="argile"
                centre={indic.checklistPct == null ? '—' : `${indic.checklistPct} %`}
                ariaLabel={
                  indic.checklistPct == null
                    ? 'Avancement checklists : aucune checklist en cours'
                    : `Avancement checklists : ${indic.checklistPct} %`
                }
                sousTexte={
                  indic.checklistPct == null
                    ? 'Aucune checklist en cours'
                    : `Moyenne sur ${nChecklist} projet${nChecklist > 1 ? 's' : ''} actif${
                        nChecklist > 1 ? 's' : ''
                      }`
                }
              />
              <RadialGauge
                data={{
                  pourcentage: del && del.total ? (del.aTemps / del.total) * 100 : 0,
                }}
                libelle="Délais avant-projet tenus"
                ton="sauge"
                centre={del && del.total ? `${del.aTemps}/${del.total}` : '—'}
                ariaLabel={
                  del && del.total
                    ? `Délais avant-projet tenus : ${del.aTemps} sur ${del.total}`
                    : 'Délais avant-projet tenus : aucune échéance datée'
                }
                sousTexte={
                  !del || del.total === 0
                    ? 'Aucune échéance datée'
                    : del.aTemps === del.total
                      ? 'Aucun retard enregistré'
                      : `${del.total - del.aTemps} avant-projet${
                          del.total - del.aTemps > 1 ? 's' : ''
                        } hors délais`
                }
              />
            </section>

            {/* Fait brut annuel — identique pour tout le monde, jamais absent,
                aucune notion de série « d'affilée ». Encart neutre. */}
            <p className="indic-fait">
              <strong>{indic.faitAnnuel.datesCetteAnnee}</strong> avant-projet
              {indic.faitAnnuel.datesCetteAnnee > 1 ? 's' : ''} daté
              {indic.faitAnnuel.datesCetteAnnee > 1 ? 's' : ''} validé
              {indic.faitAnnuel.datesCetteAnnee > 1 ? 's' : ''} en{' '}
              {indic.faitAnnuel.annee}, dont{' '}
              <strong>{indic.faitAnnuel.dansLesDelais}</strong> dans les délais.
            </p>

            {/* Projets actifs — cartes enrichies */}
            <div className="indic-tete">
              <h3>Projets actifs</h3>
              <span className="indic-tete-compte">{indic.projetsActifs.length}</span>
            </div>
            {indic.projetsActifs.length === 0 ? (
              <p className="empty-state empty-state--bloc">
                Aucun projet actif ne t’est rattaché pour le moment.
              </p>
            ) : (
              <ul className="indic-projets">
                {indic.projetsActifs.map((p) => {
                  const Icone = ICONE_BIEN[p.type];
                  const pct = p.checklistPct;
                  return (
                    <li key={p.id}>
                      <Link href={`${projetBase}/${p.id}`} className="indic-projet">
                        <span className="indic-projet-ico" aria-hidden>
                          <Icone size={18} strokeWidth={1.75} />
                        </span>
                        <span className="indic-projet-txt">
                          <span className="indic-projet-nom">
                            <span className="indic-projet-code">{p.code}</span>
                            {p.programme}
                          </span>
                          <span className="indic-projet-client">
                            {TYPES_BIEN[p.type]} · {p.clientNom}
                          </span>
                          {pct == null ? (
                            <span className="indic-bar-vide">Pas encore de checklist</span>
                          ) : (
                            <span className="indic-bar-wrap">
                              <span
                                className={`indic-bar indic-bar--${
                                  pct >= 80 ? 'ok' : 'warn'
                                }`}
                                role="img"
                                aria-label={`Checklist : ${pct} %`}
                              >
                                <span
                                  className="indic-bar-fill"
                                  style={{ width: `${pct}%` }}
                                />
                              </span>
                              <span className="indic-bar-val">{pct} %</span>
                            </span>
                          )}
                        </span>
                        <span className="pill pill--phase">{PHASES[p.phase]}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Historique — projets livrés */}
            <div className="indic-tete">
              <h3>Historique — projets livrés</h3>
              <span className="indic-tete-compte">{indic.historique.length}</span>
            </div>
            <p className="indic-note">
              Mesuré sur l’avant-projet seul : sa date de validation contre son
              échéance. Aucune date de livraison réelle n’est suivie.
            </p>
            {indic.historique.length === 0 ? (
              <p className="empty-state empty-state--bloc">
                Aucun projet livré à ton actif pour l’instant.
              </p>
            ) : (
              <ul className="indic-histo">
                {indic.historique.map((p) => {
                  const d = delaiAvantProjet(p);
                  return (
                    <li key={p.id}>
                      <Link href={`${projetBase}/${p.id}`} className="indic-histo-row">
                        <span className="indic-histo-nom">
                          <span className="indic-projet-code">{p.code}</span>
                          {p.programme}
                        </span>
                        <span className="indic-histo-client">{p.clientNom}</span>
                        <span className={`indic-delai indic-delai--${d.ton}`}>
                          {d.texte}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </CollaborateurShell>
  );
}
