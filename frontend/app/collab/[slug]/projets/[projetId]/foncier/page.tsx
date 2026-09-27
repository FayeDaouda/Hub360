'use client';

import { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import {
  getFoncier,
  joindreFichiersFoncier,
  joindreImagesFoncier,
  patchBlocFoncier,
  patchItemFoncier,
} from '@/lib/foncier';
import { getMonProfil } from '@/lib/collab';
import {
  avancementChecklistFichiers,
  type Foncier,
  type FichierItemFoncier,
  type GroupeFoncierCle,
  type ItemFoncier,
  type MonProfil,
} from '@/lib/types';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture } from '@/components/collab/lecture';
import { BoutonDetail, JoindreAvecItemModal } from '@/components/permis-piece-jointe';
import { FoncierDetailModal } from '@/components/foncier-detail-modal';

type Props = { params: { slug: string; projetId: string } };

function telecharger(f: FichierItemFoncier) {
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell slug={params.slug} projetId={params.projetId} section="foncier">
      {() => <Vue slug={params.slug} projetId={params.projetId} />}
    </SectionCollabShell>
  );
}

function Vue({ slug, projetId }: { slug: string; projetId: string }) {
  const [foncier, setFoncier] = useState<Foncier | null>(null);
  // Profil complet : id (pour savoir si je suis le responsable d'un bloc) +
  // estDispatcher/equipeAssignable (qui peut réassigner — même périmètre que
  // le guard estAutoriseAAssigner, identique à Permis).
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const monId = profil?.id ?? null;
  const [erreur, setErreur] = useState<string | null>(null);
  // Item dont la popup « Détails » (historique des fichiers) est ouverte.
  const [detailItem, setDetailItem] = useState<ItemFoncier | null>(null);
  // Groupe dont la popup « Joindre » (item-picker) est ouverte.
  const [joindreGroupeOuvert, setJoindreGroupeOuvert] = useState<GroupeFoncierCle | null>(null);

  useEffect(() => {
    getFoncier(slug, projetId)
      .then(setFoncier)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Chargement impossible.'));
    getMonProfil(slug).then(setProfil).catch(() => setProfil(null));
  }, [slug, projetId]);

  async function joindreImages(itemId: string, fichiers: { nom: string; url: string }[]) {
    setErreur(null);
    try {
      setFoncier(await joindreImagesFoncier(slug, projetId, itemId, fichiers));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    }
  }

  async function joindreFichiers(
    itemId: string,
    fichiers: { nom: string; url: string; taille?: number }[],
  ) {
    setErreur(null);
    try {
      setFoncier(await joindreFichiersFoncier(slug, projetId, itemId, fichiers));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    }
  }

  async function basculerNonNecessaire(item: ItemFoncier) {
    setErreur(null);
    try {
      setFoncier(
        await patchItemFoncier(slug, projetId, item.id, {
          nonRequise: item.statut !== 'non_necessaire',
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.');
    }
  }

  // Case à cocher manuelle (sept. 2026, en plus du statut dérivé des
  // fichiers) — librement décochable même si des fichiers restent attachés.
  async function basculerFait(item: ItemFoncier) {
    setErreur(null);
    try {
      setFoncier(await patchItemFoncier(slug, projetId, item.id, { fait: item.statut !== 'fait' }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.');
    }
  }

  async function majResponsableBloc(groupe: GroupeFoncierCle, responsableId: string | null) {
    try {
      setFoncier(await patchBlocFoncier(slug, projetId, groupe, responsableId));
    } catch {
      /* 403 si la cible sort du périmètre du dispatcher — état inchangé */
    }
  }

  if (!foncier) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  return (
    <>
      {erreur && <p className="field-erreur">{erreur}</p>}
      {foncier.groupes.map((groupe) => {
        const av = avancementChecklistFichiers(groupe.items);
        const jeSuisResponsable = !!monId && groupe.responsable?.id === monId;
        // Bloc libre = toute l'équipe agit (règle de septembre, en repli) ;
        // bloc assigné = seul le responsable (+ admin, non pertinent ici).
        const peutAgir = !groupe.responsable || jeSuisResponsable;
        return (
          <BlocLecture key={groupe.groupe} titre={`${groupe.libelle} · ${av.faits}/${av.total}`}>
            <p className="ap-souscheck-groupe-desc" style={{ marginTop: 0 }}>
              {groupe.description}
            </p>
            <div className="ap-souscheck-bloc-meta">
              {/* Éditable UNIQUEMENT si je suis dispatcher de ma cellule ET
                  que le responsable (actuel ou nul) en fait partie — même
                  périmètre que le guard estAutoriseAAssigner. Sinon, lecture
                  seule + éventuel bouton d'auto-désignation. */}
              {profil?.estDispatcher &&
              (!groupe.responsable ||
                profil.equipeAssignable.some((m) => m.id === groupe.responsable!.id)) ? (
                <label className="field ap-souscheck-bloc-champ">
                  <span className="field-label">Responsable du bloc</span>
                  <select
                    className="field-input"
                    value={groupe.responsable?.id ?? ''}
                    onChange={(e) => majResponsableBloc(groupe.groupe, e.target.value || null)}
                  >
                    <option value="">— Non désigné —</option>
                    {profil.equipeAssignable.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.prenom} {m.nom}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <span className="ap-souscheck-assigne-txt">
                    Responsable : {groupe.responsable ? groupe.responsable.nom : '—'}
                  </span>
                  {/* Auto-assignation sur un bloc encore libre — ouvert à
                      toute l'équipe du projet, pas seulement au dispatcher.
                      Jamais proposé si un responsable est déjà désigné. */}
                  {!groupe.responsable && monId && (
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--sm"
                      onClick={() => majResponsableBloc(groupe.groupe, monId)}
                    >
                      Me désigner responsable
                    </button>
                  )}
                </>
              )}
              {peutAgir && (
                <div className="field ap-souscheck-bloc-champ ap-souscheck-bloc-champ--joindre">
                  <span className="field-label">Ajouter une pièce</span>
                  <button
                    type="button"
                    className="field-input ap-souscheck-joindre-champ"
                    onClick={() => setJoindreGroupeOuvert(groupe.groupe)}
                  >
                    <Paperclip size={14} strokeWidth={2} aria-hidden />
                    Joindre
                  </button>
                </div>
              )}
            </div>

            <ul>
                {groupe.items.map((item) => (
                  <li
                    key={item.id}
                    className={`ap-souscheck-item ap-souscheck-item--permis${
                      item.statut === 'non_necessaire' ? ' ap-souscheck-item--non-requise' : ''
                    }`}
                  >
                    <label className="ap-souscheck-fait">
                      <input
                        type="checkbox"
                        checked={item.statut === 'fait'}
                        disabled={item.statut === 'non_necessaire' || !peutAgir}
                        onChange={() => basculerFait(item)}
                      />
                      <span>{item.libelle}</span>
                    </label>
                    <span className="ap-souscheck-actions">
                      {peutAgir && (
                        <button
                          type="button"
                          className={`ap-souscheck-non-requise${
                            item.statut === 'non_necessaire' ? ' est-actif' : ''
                          }`}
                          onClick={() => basculerNonNecessaire(item)}
                        >
                          Non nécessaire
                        </button>
                      )}
                      <BoutonDetail
                        actif={item.fichiers.length > 0}
                        onClick={() => setDetailItem(item)}
                      />
                    </span>
                  </li>
                ))}
            </ul>
          </BlocLecture>
        );
      })}

      {detailItem && (
        <FoncierDetailModal
          libelle={detailItem.libelle}
          fichiers={detailItem.fichiers}
          onTelecharger={telecharger}
          onClose={() => setDetailItem(null)}
        />
      )}

      {joindreGroupeOuvert && (
        <JoindreAvecItemModal
          items={
            foncier.groupes
              .find((g) => g.groupe === joindreGroupeOuvert)
              ?.items.map((it) => ({ id: it.id, libelle: it.libelle })) ?? []
          }
          onJoindreImages={joindreImages}
          onJoindreFichiers={joindreFichiers}
          onClose={() => setJoindreGroupeOuvert(null)}
        />
      )}
    </>
  );
}
