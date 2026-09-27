'use client';

import { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import {
  demanderProlongationBlocChecklistAvp,
  getAvantProjet,
  joindreFichiersLigneChecklistAvp,
  joindreImagesLigneChecklistAvp,
  majLigneChecklistAvp,
  patchBlocChecklistAvp,
} from '@/lib/projets';
import { getMonProfil } from '@/lib/collab';
import {
  avancementChecklistFichiers,
  type AvantProjet,
  type FichierItemChecklistAvp,
  type GroupeChecklistAvp,
  type ItemChecklistAvp,
  type MonProfil,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture } from '@/components/collab/lecture';
import { ProlongationModal } from '@/components/collab/prolongation-modal';
import { BoutonDetail, JoindreAvecItemModal } from '@/components/permis-piece-jointe';
import { FoncierDetailModal } from '@/components/foncier-detail-modal';

type Props = { params: { slug: string; projetId: string } };

function telecharger(f: FichierItemChecklistAvp) {
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell slug={params.slug} projetId={params.projetId} section="avant-projet">
      {() => <Vue slug={params.slug} projetId={params.projetId} />}
    </SectionCollabShell>
  );
}

function Vue({ slug, projetId }: { slug: string; projetId: string }) {
  const [ap, setAp] = useState<AvantProjet | null>(null);
  // Profil complet : id (pour savoir si je suis responsable d'un bloc) +
  // estDispatcher/equipeAssignable (qui peut réassigner — même périmètre que
  // le guard estAutoriseAAssigner, identique à Permis/Foncier).
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const monId = profil?.id ?? null;
  const [erreur, setErreur] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<ItemChecklistAvp | null>(null);
  const [prolongerGroupe, setProlongerGroupe] = useState<GroupeChecklistAvp | null>(null);
  // Groupe dont la popup « Joindre » (item-picker) est ouverte.
  const [joindreGroupeOuvert, setJoindreGroupeOuvert] = useState<GroupeChecklistAvp | null>(null);

  useEffect(() => {
    getAvantProjet(slug, projetId).then(setAp).catch(() => setAp(null));
    getMonProfil(slug).then(setProfil).catch(() => setProfil(null));
  }, [slug, projetId]);

  // Sondage — la checklist peut changer côté admin pendant que cette page
  // reste ouverte.
  useEffect(() => {
    const id = setInterval(() => {
      getAvantProjet(slug, projetId).then(setAp).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [slug, projetId]);

  async function basculerNonNecessaire(item: ItemChecklistAvp) {
    setErreur(null);
    try {
      setAp(
        await majLigneChecklistAvp(slug, projetId, item.id, {
          nonRequise: item.statut !== 'non_necessaire',
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.');
    }
  }

  // Case à cocher manuelle (sept. 2026, en plus du statut dérivé des
  // fichiers) — librement décochable même si des fichiers restent attachés.
  async function basculerFait(item: ItemChecklistAvp) {
    setErreur(null);
    try {
      setAp(await majLigneChecklistAvp(slug, projetId, item.id, { fait: item.statut !== 'fait' }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.');
    }
  }

  async function joindreImages(itemId: string, fichiers: { nom: string; url: string }[]) {
    setErreur(null);
    try {
      setAp(await joindreImagesLigneChecklistAvp(slug, projetId, itemId, fichiers));
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
      setAp(await joindreFichiersLigneChecklistAvp(slug, projetId, itemId, fichiers));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    }
  }

  async function majResponsableBloc(groupe: GroupeChecklistAvp, responsableId: string | null) {
    try {
      setAp(await patchBlocChecklistAvp(slug, projetId, groupe, { responsableId }));
    } catch {
      /* 403 si la cible sort du périmètre du dispatcher — état inchangé */
    }
  }

  async function envoyerProlongation(payload: { echeance: string; motif?: string }) {
    if (!prolongerGroupe) return;
    setAp(await demanderProlongationBlocChecklistAvp(slug, projetId, prolongerGroupe, payload));
    setProlongerGroupe(null);
  }

  if (!ap) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  return (
    <>
      {erreur && <p className="field-erreur">{erreur}</p>}
      {ap.checklists.map((g) => {
        const av = avancementChecklistFichiers(g.items);
        const jeSuisResponsable = !!monId && g.responsable?.id === monId;
        // Bloc libre = toute l'équipe agit (règle de septembre, en repli) ;
        // bloc assigné = seul le responsable (+ admin, non pertinent ici).
        const peutAgir = !g.responsable || jeSuisResponsable;
        return (
          <BlocLecture key={g.groupe} titre={`${g.libelle} · ${av.faits}/${av.total}`}>
            <p className="ap-souscheck-groupe-desc" style={{ marginTop: 0 }}>
              {g.description}
            </p>
            <div className="ap-souscheck-bloc-meta">
              {/* Éditable UNIQUEMENT si je suis dispatcher de ma cellule ET
                  que le responsable (actuel ou nul) en fait partie — même
                  périmètre que le guard estAutoriseAAssigner. */}
              {profil?.estDispatcher &&
              (!g.responsable || profil.equipeAssignable.some((m) => m.id === g.responsable!.id)) ? (
                <label className="field ap-souscheck-bloc-champ">
                  <span className="field-label">Responsable du bloc</span>
                  <select
                    className="field-input"
                    value={g.responsable?.id ?? ''}
                    onChange={(e) => majResponsableBloc(g.groupe, e.target.value || null)}
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
                  <span className="ap-souscheck-echeance-txt">
                    Échéance : {g.echeance ? formatDateCourte(g.echeance) : '—'}
                  </span>
                  <span className="ap-souscheck-assigne-txt">
                    Responsable : {g.responsable ? g.responsable.nom : '—'}
                  </span>
                  {!g.responsable && monId && (
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--sm"
                      onClick={() => majResponsableBloc(g.groupe, monId)}
                    >
                      Me désigner responsable
                    </button>
                  )}
                </>
              )}
              {jeSuisResponsable &&
                (g.prolongationDemandeeLe ? (
                  <span
                    className="ap-souscheck-prolongation-attente"
                    title={`Proposée au ${formatDateCourte(g.prolongationEcheance!)}`}
                  >
                    Prolongation en attente
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--sm"
                    onClick={() => setProlongerGroupe(g.groupe)}
                  >
                    Demander une prolongation
                  </button>
                ))}
              {peutAgir && (
                <div className="field ap-souscheck-bloc-champ ap-souscheck-bloc-champ--joindre">
                  <span className="field-label">Ajouter une pièce</span>
                  <button
                    type="button"
                    className="field-input ap-souscheck-joindre-champ"
                    onClick={() => setJoindreGroupeOuvert(g.groupe)}
                  >
                    <Paperclip size={14} strokeWidth={2} aria-hidden />
                    Joindre
                  </button>
                </div>
              )}
            </div>

            <ul>
              {g.items.map((item) => (
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

      {prolongerGroupe && (
        <ProlongationModal
          libelle={ap.checklists.find((g) => g.groupe === prolongerGroupe)?.libelle ?? ''}
          echeanceActuelle={
            ap.checklists.find((g) => g.groupe === prolongerGroupe)?.echeance ?? null
          }
          onSubmit={envoyerProlongation}
          onClose={() => setProlongerGroupe(null)}
        />
      )}

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
            ap.checklists
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
