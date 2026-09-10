'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Plus, RotateCcw, Star, Trash2, X } from 'lucide-react';
import { getSociete } from '@/lib/api';
import { getProjetExecution } from '@/lib/projets';
import {
  ajouterImages,
  getImagesProjet,
  getImagesSupprimees,
  majImage,
  majImagesEnLot,
  reordonnerPortfolio,
  restaurerImage,
  supprimerImages,
} from '@/lib/images';
import { estImage, lireImageRedimensionnee } from '@/lib/image-fichier';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import {
  CATEGORIES,
  NATURES_DOSSIER,
  PHASES,
  PHASES_PAR_CATEGORIE,
  USAGES_IMAGE,
  type ImageProjet,
  type Phase,
  type ProjetExecution,
  type Session,
  type Societe,
  type UsageImage,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { AdminShell } from '@/components/admin/admin-shell';
import { ConfirmModal } from '@/components/admin/confirm-modal';

type Props = { params: { slug: string; projetId: string } };

const FILTRES = [
  { cle: 'tout', libelle: 'Tout' },
  { cle: 'travail', libelle: 'Travail' },
  { cle: 'portfolio', libelle: 'Portfolio' },
  { cle: 'corbeille', libelle: 'Corbeille' },
] as const;
type Filtre = (typeof FILTRES)[number]['cle'];

const JOUR = 86_400_000;
const estRecent = (iso: string) => Date.now() - new Date(iso).getTime() < 7 * JOUR;

function telecharger(img: ImageProjet) {
  const a = document.createElement('a');
  a.href = img.url;
  a.download = img.nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function ImagesPage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [images, setImages] = useState<ImageProjet[] | null>(null);
  const [corbeille, setCorbeille] = useState<ImageProjet[]>([]);

  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [recherche, setRecherche] = useState('');
  const [filtrePhase, setFiltrePhase] = useState<Phase | ''>('');
  const [filtreAuteur, setFiltreAuteur] = useState('');
  const [tri, setTri] = useState<'recent' | 'ancien'>('recent');

  const [selId, setSelId] = useState<string | null>(null);
  const [modeSelection, setModeSelection] = useState(false);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [supprConfirm, setSupprConfirm] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const utilisateur = session
    ? `${session.utilisateur.prenom} ${session.utilisateur.nom}`.trim()
    : '';

  useEffect(() => {
    const current = getSession();
    if (!current || current.societe.slug !== params.slug) {
      router.replace(`/login/${params.slug}`);
      return;
    }
    if (current.role !== 'societe_admin') {
      router.replace(destinationForSession(current));
      return;
    }
    setSession(current);
    getSociete(params.slug).then(setSociete).catch(() => setSociete(null));
    getProjetExecution(params.slug, params.projetId).then(setProjet);
    getImagesProjet(params.slug, params.projetId).then(setImages);
    getImagesSupprimees(params.slug, params.projetId).then(setCorbeille);
  }, [params.slug, params.projetId, router]);

  const auteurs = useMemo(() => {
    const set = new Set<string>();
    (images ?? []).forEach((i) => set.add(i.ajoutePar));
    return [...set].sort();
  }, [images]);

  const enCorbeille = filtre === 'corbeille';

  const visibles = useMemo(() => {
    const source = enCorbeille ? corbeille : images ?? [];
    const q = recherche.trim().toLowerCase();
    return source
      .filter((i) => (enCorbeille || filtre === 'tout' ? true : i.usage === filtre))
      .filter((i) =>
        !q ? true : `${i.nom} ${i.legende}`.toLowerCase().includes(q),
      )
      .filter((i) => (filtrePhase ? i.phase === filtrePhase : true))
      .filter((i) => (filtreAuteur ? i.ajoutePar === filtreAuteur : true))
      .sort(
        filtre === 'portfolio'
          ? (a, b) => a.ordre - b.ordre
          : (a, b) => {
              const d = +new Date(a.ajouteLe) - +new Date(b.ajouteLe);
              return tri === 'recent' ? -d : d;
            },
      );
  }, [enCorbeille, corbeille, images, filtre, recherche, filtrePhase, filtreAuteur, tri]);

  if (!session) return null;

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;
  const phasesProjet: Phase[] = projet ? PHASES_PAR_CATEGORIE[projet.categorie] : [];
  const selection = [...(images ?? []), ...corbeille].find((i) => i.id === selId) ?? null;
  const lot = [...coches];

  function toggleCoche(id: string) {
    setCoches((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function quitterSelection() {
    setModeSelection(false);
    setCoches(new Set());
  }

  async function ajouterFichiers(liste: FileList | File[]) {
    const fichiers = Array.from(liste).filter(estImage);
    if (!fichiers.length) return;
    setEnCours(true);
    setErreur(null);
    try {
      const lus = await Promise.all(fichiers.map(lireImageRedimensionnee));
      const nouvelles = await ajouterImages(params.slug, params.projetId, lus, utilisateur);
      setImages((cur) => [...nouvelles, ...(cur ?? [])]);
    } catch {
      setErreur("Certains fichiers n'ont pas pu être ajoutés.");
    }
    setEnCours(false);
  }

  async function patchSel(patch: {
    usage?: UsageImage;
    phase?: Phase | null;
    legende?: string;
  }) {
    if (!selection) return;
    const maj = await majImage(params.slug, params.projetId, selection.id, patch);
    setImages((cur) => (cur ?? []).map((i) => (i.id === maj.id ? maj : i)));
  }

  async function appliquerLot(patch: { usage?: UsageImage; phase?: Phase | null }) {
    if (!lot.length) return;
    const maj = await majImagesEnLot(params.slug, params.projetId, lot, patch);
    setImages(maj);
    quitterSelection();
  }

  function demanderSuppression(ids: string[]) {
    if (ids.length) setSupprConfirm(ids);
  }

  async function confirmerSuppression() {
    const ids = supprConfirm ?? [];
    await supprimerImages(params.slug, params.projetId, ids, utilisateur);
    const quand = new Date().toISOString();
    setImages((cur) => (cur ?? []).filter((i) => !ids.includes(i.id)));
    setCorbeille((cur) => [
      ...(images ?? [])
        .filter((i) => ids.includes(i.id))
        .map((i) => ({ ...i, supprimee: true, supprimeLe: quand, supprimePar: utilisateur })),
      ...cur,
    ]);
    setSupprConfirm(null);
    setSelId(null);
    quitterSelection();
  }

  async function restaurer(id: string) {
    await restaurerImage(params.slug, params.projetId, id);
    const img = corbeille.find((i) => i.id === id);
    setCorbeille((cur) => cur.filter((i) => i.id !== id));
    if (img) {
      setImages((cur) => [
        { ...img, supprimee: false, supprimeLe: null, supprimePar: null },
        ...(cur ?? []),
      ]);
    }
    setSelId(null);
  }

  function deposerSur(cibleId: string) {
    if (!dragId || dragId === cibleId || !images) return setDragId(null);
    const portfolio = images
      .filter((i) => i.usage === 'portfolio')
      .sort((a, b) => a.ordre - b.ordre);
    const from = portfolio.findIndex((i) => i.id === dragId);
    const to = portfolio.findIndex((i) => i.id === cibleId);
    if (from < 0 || to < 0) return setDragId(null);
    const reordonne = [...portfolio];
    const [deplace] = reordonne.splice(from, 1);
    reordonne.splice(to, 0, deplace);
    const ids = reordonne.map((i) => i.id);
    setImages((cur) =>
      (cur ?? []).map((i) => {
        const rang = ids.indexOf(i.id);
        return rang >= 0 ? { ...i, ordre: rang } : i;
      }),
    );
    reordonnerPortfolio(params.slug, params.projetId, ids);
    setDragId(null);
  }

  return (
    <AdminShell societe={societe} session={session} active="projets" titre="Images">
      <Link href={retour} className="lien-retour">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {images === null || projet === undefined ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : projet === null ? (
        <p className="empty-state empty-state--bloc">Projet introuvable.</p>
      ) : (
        <>
          <header className="projet-entete">
            <div className="projet-entete-titre">
              <span className="projet-entete-sur">
                <span className="dossier-code">{projet.code}</span>
                <span className={`pill pill--nature-${projet.nature}`}>
                  {NATURES_DOSSIER[projet.nature]}
                </span>
                <span className={`pill pill--cat-${projet.categorie}`}>
                  {CATEGORIES[projet.categorie]}
                </span>
              </span>
              <h2>Images</h2>
              <p className="projet-entete-meta">
                {projet.programme} · {projet.client.nom} · {projet.localisation}
              </p>
            </div>
          </header>

          <div className="images-barre">
            <div className="vue-toggle" role="group" aria-label="Filtrer">
              {FILTRES.map((f) => (
                <button
                  key={f.cle}
                  type="button"
                  className={f.cle === filtre ? 'is-active' : ''}
                  aria-pressed={f.cle === filtre}
                  onClick={() => {
                    setFiltre(f.cle);
                    quitterSelection();
                  }}
                >
                  {f.libelle}
                  {f.cle === 'corbeille' && corbeille.length > 0 && ` (${corbeille.length})`}
                </button>
              ))}
            </div>
            <span className="projets-compte">
              {visibles.length} image{visibles.length > 1 ? 's' : ''}
            </span>
            {!enCorbeille && (
              <>
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  onClick={() =>
                    modeSelection ? quitterSelection() : setModeSelection(true)
                  }
                >
                  {modeSelection ? 'Annuler' : 'Sélectionner'}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => inputRef.current?.click()}
                >
                  <Plus size={16} strokeWidth={2} aria-hidden />
                  <span>Ajouter</span>
                </button>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => e.target.files && ajouterFichiers(e.target.files)}
            />
          </div>

          <div className="images-filtres">
            <input
              type="search"
              className="field-input images-recherche"
              placeholder="Rechercher un nom, une légende…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
            <select
              className="field-input"
              value={filtrePhase}
              onChange={(e) => setFiltrePhase(e.target.value as Phase | '')}
              aria-label="Filtrer par phase"
            >
              <option value="">Toutes phases</option>
              {phasesProjet.map((ph) => (
                <option key={ph} value={ph}>
                  {PHASES[ph]}
                </option>
              ))}
            </select>
            <select
              className="field-input"
              value={filtreAuteur}
              onChange={(e) => setFiltreAuteur(e.target.value)}
              aria-label="Filtrer par auteur"
            >
              <option value="">Tous les auteurs</option>
              {auteurs.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            {filtre !== 'portfolio' && (
              <select
                className="field-input"
                value={tri}
                onChange={(e) => setTri(e.target.value as 'recent' | 'ancien')}
                aria-label="Trier"
              >
                <option value="recent">Plus récent</option>
                <option value="ancien">Plus ancien</option>
              </select>
            )}
          </div>

          {modeSelection && lot.length > 0 && (
            <div className="images-lot" role="region" aria-label="Actions groupées">
              <span>
                {lot.length} sélectionnée{lot.length > 1 ? 's' : ''}
              </span>
              <select
                className="field-input"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) appliquerLot({ usage: e.target.value as UsageImage });
                  e.target.value = '';
                }}
                aria-label="Changer l'usage"
              >
                <option value="">Usage…</option>
                {(Object.keys(USAGES_IMAGE) as UsageImage[]).map((u) => (
                  <option key={u} value={u}>
                    {USAGES_IMAGE[u]}
                  </option>
                ))}
              </select>
              <select
                className="field-input"
                defaultValue="__"
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  if (v !== '__') {
                    appliquerLot({ phase: v === '__aucune' ? null : (v as Phase) });
                  }
                  e.currentTarget.value = '__';
                }}
                aria-label="Changer la phase"
              >
                <option value="__">Phase…</option>
                <option value="__aucune">— Aucune</option>
                {phasesProjet.map((ph) => (
                  <option key={ph} value={ph}>
                    {PHASES[ph]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                onClick={() => demanderSuppression(lot)}
              >
                <Trash2 size={14} strokeWidth={2} aria-hidden />
                <span>Supprimer</span>
              </button>
            </div>
          )}

          <div
            className={`images-dropzone${survol ? ' is-survol' : ''}`}
            onDragOver={(e) => {
              if (enCorbeille) return;
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              if (enCorbeille) return;
              e.preventDefault();
              setSurvol(false);
              ajouterFichiers(e.dataTransfer.files);
            }}
          >
            {visibles.length === 0 ? (
              <p className="images-vide">
                {enCorbeille
                  ? 'Corbeille vide.'
                  : recherche || filtrePhase || filtreAuteur || filtre !== 'tout'
                    ? 'Aucune image ne correspond.'
                    : 'Glisse des images ici, ou « Ajouter ».'}
              </p>
            ) : (
              <ul className="images-grille">
                {visibles.map((img) => {
                  const cochee = coches.has(img.id);
                  const ordonnable = filtre === 'portfolio' && !modeSelection;
                  return (
                    <li
                      key={img.id}
                      className={`image-vignette${dragId === img.id ? ' is-drag' : ''}${
                        cochee ? ' is-cochee' : ''
                      }${ordonnable ? ' is-ordonnable' : ''}`}
                      draggable={ordonnable}
                      onDragStart={() => ordonnable && setDragId(img.id)}
                      onDragEnd={() => setDragId(null)}
                      onDragOver={(e) => ordonnable && e.preventDefault()}
                      onDrop={() => ordonnable && deposerSur(img.id)}
                    >
                      <button
                        type="button"
                        className="image-vignette-btn"
                        onClick={() =>
                          modeSelection ? toggleCoche(img.id) : setSelId(img.id)
                        }
                      >
                        <img src={img.url} alt={img.legende || img.nom} loading="lazy" />
                        {img.usage === 'portfolio' && !enCorbeille && !modeSelection && (
                          <span className="image-badge" title="Portfolio">
                            <Star size={12} strokeWidth={2.5} aria-hidden />
                          </span>
                        )}
                        {!enCorbeille && estRecent(img.ajouteLe) && (
                          <span className="image-badge-recent">récent</span>
                        )}
                        {modeSelection && (
                          <span className={`image-coche${cochee ? ' is-on' : ''}`} aria-hidden />
                        )}
                      </button>

                      <span className="image-nom">{img.legende || img.nom}</span>

                      {enCorbeille ? (
                        <span className="image-sous">
                          Supprimée par {img.supprimePar} · {formatDateCourte(img.supprimeLe!)}
                          <button
                            type="button"
                            className="lien-inline"
                            onClick={() => restaurer(img.id)}
                          >
                            <RotateCcw size={12} strokeWidth={2} aria-hidden /> Restaurer
                          </button>
                        </span>
                      ) : (
                        <span className="image-sous">
                          {img.ajoutePar}
                          <button
                            type="button"
                            className="lien-inline"
                            onClick={() => telecharger(img)}
                            title="Télécharger"
                          >
                            <Download size={12} strokeWidth={2} aria-hidden /> Télécharger
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {erreur && <p className="field-erreur">{erreur}</p>}
          {enCours && <p className="images-encours">Traitement des images…</p>}
        </>
      )}

      {selection && (
        <div className="modal-backdrop" onClick={() => setSelId(null)}>
          <div
            className="modal image-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Image ${selection.nom}`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>{selection.nom}</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Fermer"
                onClick={() => setSelId(null)}
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </header>

            <div className="modal-body">
              <img
                className="image-apercu"
                src={selection.url}
                alt={selection.legende || selection.nom}
              />

              {selection.supprimee ? (
                <p className="image-meta">
                  Supprimée par {selection.supprimePar} ·{' '}
                  {formatDateCourte(selection.supprimeLe!)}
                </p>
              ) : (
                <>
                  <div className="field-row">
                    <label className="field">
                      <span className="field-label">Usage</span>
                      <select
                        className="field-input"
                        value={selection.usage}
                        onChange={(e) => patchSel({ usage: e.target.value as UsageImage })}
                      >
                        {(Object.keys(USAGES_IMAGE) as UsageImage[]).map((u) => (
                          <option key={u} value={u}>
                            {USAGES_IMAGE[u]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">Phase (indicatif)</span>
                      <select
                        className="field-input"
                        value={selection.phase ?? ''}
                        onChange={(e) =>
                          patchSel({
                            phase: e.target.value ? (e.target.value as Phase) : null,
                          })
                        }
                      >
                        <option value="">—</option>
                        {phasesProjet.map((ph) => (
                          <option key={ph} value={ph}>
                            {PHASES[ph]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {selection.usage === 'portfolio' && (
                    <label className="field">
                      <span className="field-label">Légende — site vitrine</span>
                      <input
                        className="field-input"
                        value={selection.legende}
                        onChange={(e) =>
                          setImages((cur) =>
                            (cur ?? []).map((i) =>
                              i.id === selection.id ? { ...i, legende: e.target.value } : i,
                            ),
                          )
                        }
                        onBlur={(e) => patchSel({ legende: e.target.value })}
                        placeholder="ex : Villa Almadies — salon"
                      />
                    </label>
                  )}

                  <p className="image-meta">
                    Ajoutée par {selection.ajoutePar} ·{' '}
                    {formatDateCourte(selection.ajouteLe)}
                  </p>
                </>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => telecharger(selection)}
                >
                  <Download size={14} strokeWidth={2} aria-hidden />
                  <span>Télécharger</span>
                </button>
                {selection.supprimee ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => restaurer(selection.id)}
                  >
                    Restaurer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => demanderSuppression([selection.id])}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {supprConfirm && (
        <ConfirmModal
          titre="Déplacer vers la corbeille"
          danger
          confirmer="Supprimer"
          message={
            <>
              {supprConfirm.length} image{supprConfirm.length > 1 ? 's' : ''} iront dans la
              corbeille. Tu pourras les restaurer depuis l&rsquo;onglet « Corbeille ».
            </>
          }
          onClose={() => setSupprConfirm(null)}
          onConfirm={confirmerSuppression}
        />
      )}
    </AdminShell>
  );
}
