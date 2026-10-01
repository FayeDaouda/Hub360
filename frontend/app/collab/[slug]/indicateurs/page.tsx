'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Boxes,
  Briefcase,
  Building2,
  Home,
  Hotel,
  Landmark,
  Printer,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { getMonProfil } from '@/lib/collab';
import { getIndicateurs } from '@/lib/equipe';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import {
  CHEMIN_MODULE_TACHE,
  MODULES_TACHE,
  NIVEAUX_COLLABORATEUR,
  PHASES,
  TYPES_BIEN,
  type IndicateursCollaborateur,
  type LigneProjetIndic,
  type ModuleTache,
  type MonProfil,
  type TypeBien,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { RadialGauge } from '@/components/admin/radial-gauge';

type FiltreStatutTache = 'toutes' | 'a_faire' | 'faites' | 'retard';

type Props = { params: { slug: string } };

// Icône générique par type de bien — repère visuel en attendant les vignettes
// de portfolio. Aucune donnée nouvelle : projet.type existe déjà.
const ICONE_BIEN: Record<TypeBien, LucideIcon> = {
  villa: Home,
  immeuble_residentiel: Building2,
  immeuble_mixte: Boxes,
  immeuble_bureaux: Briefcase,
  local_commercial: Store,
  hotelier: Hotel,
  equipement: Landmark,
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

// « Mes indicateurs » — page « mon parcours », pas un second tableau de bord.
// Tout est calcul de lecture serveur (endpoint indicateurs) : aucune saisie
// côté collaborateur, aucun score agrégé, aucune comparaison entre personnes.
export default function IndicateursPage({ params }: Props) {
  useTitrePage('Mes indicateurs');
  const session = useSessionCourante();
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const [indic, setIndic] = useState<IndicateursCollaborateur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatutTache>('toutes');
  const [filtreModule, setFiltreModule] = useState<'tous' | ModuleTache>('tous');

  useEffect(() => {
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
  }, [params.slug]);

  const projetBase = `/collab/${params.slug}/projets`;
  const mt = indic?.mesTaches;
  // Moyenne « avancement checklists » : sur les projets actifs qui ONT une checklist.
  const nChecklist = (indic?.projetsActifs ?? []).filter(
    (p) => p.checklistPct != null,
  ).length;

  // « Mes tâches » filtrable (point 2, sept. 2026, décision boss) — tri : en
  // retard d'abord, puis par échéance croissante (sans échéance en dernier).
  const taches = useMemo(() => {
    const liste = (indic?.taches ?? []).filter((t) => {
      if (filtreModule !== 'tous' && t.module !== filtreModule) return false;
      if (filtreStatut === 'a_faire' && t.fait) return false;
      if (filtreStatut === 'faites' && !t.fait) return false;
      if (filtreStatut === 'retard' && !t.enRetard) return false;
      return true;
    });
    return [...liste].sort((a, b) => {
      if (a.enRetard !== b.enRetard) return a.enRetard ? -1 : 1;
      if (!a.echeance && !b.echeance) return 0;
      if (!a.echeance) return 1;
      if (!b.echeance) return -1;
      return a.echeance < b.echeance ? -1 : a.echeance > b.echeance ? 1 : 0;
    });
  }, [indic?.taches, filtreModule, filtreStatut]);

  return (
    <>
      <div className="indic">
        <div className="indic-actions">
          <p className="indic-intro">
            Ton parcours dans le studio — projets, tâches, délais. Aucune note, aucun
            classement.
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
                discrets (ratio en sous-texte, pas de gros %). Mes tâches,
                tous modules confondus (point 3, sept. 2026, décision boss) :
                lignes Avant-projet assignées + items des blocs Permis/
                Exécution dont je suis responsable, crédités un par un. */}
            <section className="indic-anneaux">
              <RadialGauge
                data={{ pourcentage: mt?.pct ?? 0 }}
                libelle="Mes tâches complétées"
                ton="argile"
                centre={mt?.pct == null ? '—' : `${mt.pct} %`}
                ariaLabel={
                  mt?.pct == null
                    ? 'Mes tâches complétées : aucune tâche assignée'
                    : `Mes tâches complétées : ${mt.pct} %`
                }
                sousTexte={
                  mt == null || mt.total === 0
                    ? 'Aucune tâche assignée'
                    : `${mt.faites}/${mt.total} tâches, tous modules confondus`
                }
              />
              <RadialGauge
                data={{
                  pourcentage:
                    mt && mt.respectDelais.total
                      ? (mt.respectDelais.aTemps / mt.respectDelais.total) * 100
                      : 0,
                }}
                libelle="Respect des délais"
                ton="sauge"
                centre={
                  mt && mt.respectDelais.total
                    ? `${mt.respectDelais.aTemps}/${mt.respectDelais.total}`
                    : '—'
                }
                ariaLabel={
                  mt && mt.respectDelais.total
                    ? `Respect des délais : ${mt.respectDelais.aTemps} sur ${mt.respectDelais.total}`
                    : 'Respect des délais : aucune tâche faite avec échéance'
                }
                sousTexte={
                  !mt || mt.respectDelais.total === 0
                    ? 'Aucune tâche faite avec échéance'
                    : mt.respectDelais.aTemps === mt.respectDelais.total
                      ? 'Aucun retard enregistré'
                      : `${mt.respectDelais.total - mt.respectDelais.aTemps} tâche${
                          mt.respectDelais.total - mt.respectDelais.aTemps > 1 ? 's' : ''
                        } faite${
                          mt.respectDelais.total - mt.respectDelais.aTemps > 1 ? 's' : ''
                        } hors délais`
                }
              />
            </section>

            {/* En retard MAINTENANT — signal distinct du ratio historique
                ci-dessus (dérivé à la volée, pour agir tout de suite, pas
                pour juger la fiabilité dans la durée). Affiché seulement
                s'il y a lieu — pas d'alerte vide. */}
            {mt != null && mt.enRetard > 0 && (
              <p className="indic-fait indic-fait--alerte">
                <strong>{mt.enRetard}</strong> tâche{mt.enRetard > 1 ? 's' : ''} en retard
                maintenant, tous modules confondus.
              </p>
            )}

            {/* Mes tâches — liste détaillée et filtrable (point 2, sept.
                2026, décision boss). Une ligne par tâche Avant-projet, une
                ligne par BLOC pour Permis/Exécution (cf. mesTaches côté
                service : le bloc reste l'unité de travail affichée). */}
            <div className="indic-tete">
              <h3>Mes tâches</h3>
              <span className="indic-tete-compte">{indic.taches.length}</span>
            </div>
            <div className="indic-taches-filtres">
              <select
                className="field-input"
                value={filtreStatut}
                onChange={(e) => setFiltreStatut(e.target.value as FiltreStatutTache)}
              >
                <option value="toutes">Toutes</option>
                <option value="a_faire">À faire</option>
                <option value="faites">Faites</option>
                <option value="retard">En retard</option>
              </select>
              <select
                className="field-input"
                value={filtreModule}
                onChange={(e) => setFiltreModule(e.target.value as 'tous' | ModuleTache)}
              >
                <option value="tous">Tous les modules</option>
                {(Object.keys(MODULES_TACHE) as ModuleTache[]).map((m) => (
                  <option key={m} value={m}>
                    {MODULES_TACHE[m]}
                  </option>
                ))}
              </select>
            </div>
            {taches.length === 0 ? (
              <p className="empty-state empty-state--bloc">
                {indic.taches.length === 0
                  ? 'Aucune tâche assignée pour le moment.'
                  : 'Aucune tâche ne correspond à ce filtre.'}
              </p>
            ) : (
              <ul className="indic-taches">
                {taches.map((t) => (
                  <li key={`${t.module}-${t.id}`}>
                    <Link
                      href={`${projetBase}/${t.projetId}/${CHEMIN_MODULE_TACHE[t.module]}`}
                      className="indic-tache"
                    >
                      <span className="indic-tache-txt">
                        <span className="indic-tache-nom">
                          <span className="indic-tache-module">{MODULES_TACHE[t.module]}</span>
                          {t.libelle}
                        </span>
                        <span className="indic-tache-projet">
                          {t.projetCode} · {t.projetProgramme}
                        </span>
                      </span>
                      <span className="indic-tache-droite">
                        {t.total != null ? (
                          <span className="indic-tache-progres">
                            {t.faits}/{t.total}
                          </span>
                        ) : (
                          <span
                            className={`indic-tache-statut${
                              t.fait ? ' indic-tache-statut--ok' : ''
                            }`}
                          >
                            {t.fait ? 'Fait' : 'À faire'}
                          </span>
                        )}
                        {t.echeance && (
                          <span
                            className={`indic-tache-echeance${
                              t.enRetard ? ' indic-tache-echeance--retard' : ''
                            }`}
                          >
                            {formatDateCourte(t.echeance)}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

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
            {indic.historique.length === 0 ? (
              <p className="empty-state empty-state--bloc">
                Aucun projet livré à ton actif pour l’instant.
              </p>
            ) : (
              <ul className="indic-histo">
                {indic.historique.map((p) => {
                  const pct = p.checklistPct;
                  return (
                    <li key={p.id}>
                      <Link href={`${projetBase}/${p.id}`} className="indic-histo-row">
                        <span className="indic-histo-nom">
                          <span className="indic-projet-code">{p.code}</span>
                          {p.programme}
                        </span>
                        <span className="indic-histo-client">{p.clientNom}</span>
                        {pct == null ? (
                          <span className="indic-bar-vide">Pas de checklist</span>
                        ) : (
                          <span className="indic-bar-val">{pct} %</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}
