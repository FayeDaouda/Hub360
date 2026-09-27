'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, HardHat, Paperclip, Plus, Trash2 } from 'lucide-react';
import { getProjetExecution } from '@/lib/projets';
import {
  ajouterLigneChecklistExecution,
  deciderProlongationBlocExecution,
  getExecution,
  joindreFichiersLigneChecklistExecution,
  joindreImagesLigneChecklistExecution,
  majLigneChecklistExecution,
  patchBlocExecution,
  supprimerLigneChecklistExecution,
} from '@/lib/execution';
import { getCollaborateurs } from '@/lib/equipe';
import { useTitrePage } from '@/lib/layout-contexte';
import {
  avancementChecklistAvp,
  CATEGORIES,
  NATURES_DOSSIER,
  type Collaborateur,
  type Execution,
  type GroupeChecklistExecution,
  type ItemChecklistExecution,
  type ProjetExecution,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { ChampModal } from '@/components/admin/champ-modal';
import { BoutonDetail, JoindreAvecItemModal } from '@/components/permis-piece-jointe';
import { DetailItemModal } from '@/components/permis-detail-item-modal';

type Props = { params: { slug: string; projetId: string } };

export default function ExecutionPage({ params }: Props) {
  useTitrePage('Dossier Exécutions');
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [exec, setExec] = useState<Execution | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Équipe DU PROJET (cellule assignée) pour le sélecteur de responsable de
  // chaque bloc — même source que les pages Avant-projet / Permis.
  const [equipeProjet, setEquipeProjet] = useState<Collaborateur[]>([]);
  const [groupeAjout, setGroupeAjout] = useState<GroupeChecklistExecution | null>(null);
  const [groupesFermes, setGroupesFermes] = useState<Set<GroupeChecklistExecution>>(new Set());
  // Item dont la popup « Détail » (note + fichiers joints) est ouverte.
  const [detailItem, setDetailItem] = useState<ItemChecklistExecution | null>(null);
  // Groupe dont la popup « Joindre » (item-picker, même motif que Constitution
  // sur Permis, sept. 2026) est ouverte — un seul point d'upload par bloc au
  // lieu d'un bouton Joindre par item.
  const [joindreGroupeOuvert, setJoindreGroupeOuvert] = useState<GroupeChecklistExecution | null>(
    null,
  );

  function toggleGroupe(groupe: GroupeChecklistExecution) {
    setGroupesFermes((s) => {
      const suivant = new Set(s);
      if (suivant.has(groupe)) suivant.delete(groupe);
      else suivant.add(groupe);
      return suivant;
    });
  }

  useEffect(() => {
    getProjetExecution(params.slug, params.projetId).then(setProjet);
    getExecution(params.slug, params.projetId).then(setExec);
  }, [params.slug, params.projetId]);

  // Équipe(s) du projet — chargées dès que les cellules assignées sont
  // connues (arrivent avec `exec`, après `projet`). Même motif que les pages
  // Avant-projet / Permis.
  useEffect(() => {
    if (!exec?.celluleIds.length) {
      setEquipeProjet([]);
      return;
    }
    getCollaborateurs(params.slug, { cellule: exec.celluleIds })
      .then(setEquipeProjet)
      .catch(() => setEquipeProjet([]));
  }, [params.slug, exec?.celluleIds]);

  // Sondage — la checklist peut changer côté collaborateur (coché, demande de
  // prolongation) pendant que cette page reste ouverte.
  useEffect(() => {
    if (!projet) return;
    const id = setInterval(() => {
      getExecution(params.slug, params.projetId).then(setExec).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [params.slug, params.projetId, projet]);

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;

  // Coche / annote une ligne de sous-checklist — persiste tout de suite.
  async function majItemChecklist(
    ligneId: string,
    patch: { fait?: boolean; note?: string; nonRequise?: boolean },
  ) {
    setErreur(null);
    try {
      setExec(await majLigneChecklistExecution(params.slug, params.projetId, ligneId, patch));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  // Bascule « non nécessaire » — mutuellement exclusif avec fait (le serveur
  // force aussi fait à false, cf. ExecutionService.patchLigneChecklist).
  function toggleNonRequis(it: ItemChecklistExecution) {
    majItemChecklist(it.id, it.nonRequise ? { nonRequise: false } : { nonRequise: true, fait: false });
  }

  // Échéance + responsable d'un bloc — admin uniquement (vérifié côté
  // serveur). Seul le responsable désigné (+ l'admin) pourra ensuite
  // cocher/uploader/prolonger sur ce bloc précis.
  async function majBloc(
    groupe: GroupeChecklistExecution,
    patch: { echeance?: string | null; responsableId?: string | null },
  ) {
    setErreur(null);
    try {
      setExec(await patchBlocExecution(params.slug, params.projetId, groupe, patch));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  async function joindreImages(ligneId: string, fichiers: { nom: string; url: string }[]) {
    setErreur(null);
    try {
      setExec(
        await joindreImagesLigneChecklistExecution(
          params.slug,
          params.projetId,
          ligneId,
          fichiers,
        ),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout du fichier a échoué.");
    }
  }

  async function joindreFichiers(
    ligneId: string,
    fichiers: { nom: string; url: string; taille?: number }[],
  ) {
    setErreur(null);
    try {
      setExec(
        await joindreFichiersLigneChecklistExecution(
          params.slug,
          params.projetId,
          ligneId,
          fichiers,
        ),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout du fichier a échoué.");
    }
  }

  // Décision sur une demande de prolongation en attente (au niveau du bloc).
  async function deciderProlongation(groupe: GroupeChecklistExecution, accepter: boolean) {
    setErreur(null);
    try {
      setExec(
        await deciderProlongationBlocExecution(params.slug, params.projetId, groupe, accepter),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  async function ajouterItemChecklist(groupe: GroupeChecklistExecution, libelle: string) {
    setExec(
      await ajouterLigneChecklistExecution(params.slug, params.projetId, { groupe, libelle }),
    );
  }

  async function supprimerItemChecklist(ligneId: string) {
    if (!window.confirm('Retirer cet item de la checklist ?')) return;
    setErreur(null);
    try {
      setExec(await supprimerLigneChecklistExecution(params.slug, params.projetId, ligneId));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suppression impossible.');
    }
  }

  return (
    <>
      <Link href={retour} className="lien-retour lien-retour--execution">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {!exec || projet === undefined ? (
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
              <h2>
                <span className="module-icone module-icone--execution" aria-hidden>
                  <HardHat size={17} strokeWidth={1.75} />
                </span>
                Dossier Exécutions
              </h2>
              <p className="projet-entete-meta">
                {projet.programme} · {projet.client.nom} · {projet.localisation}
              </p>
            </div>
          </header>

          {exec.checklists.map((groupe) => {
            const av = avancementChecklistAvp(groupe.items);
            const fermee = groupesFermes.has(groupe.groupe);
            return (
              <section className="panel" key={groupe.groupe}>
                <button
                  type="button"
                  className="ap-souscheck-tete ap-souscheck-tete--repliable"
                  aria-expanded={!fermee}
                  onClick={() => toggleGroupe(groupe.groupe)}
                >
                  <span className="repli-badge">
                    <ChevronDown
                      size={17}
                      strokeWidth={2.25}
                      aria-hidden
                      className={`repli-icone${fermee ? ' est-replie' : ''}`}
                    />
                  </span>
                  <span className="ap-souscheck-tete-txt">
                    <h4>{groupe.libelle}</h4>
                    <p className="ap-souscheck-groupe-desc">{groupe.description}</p>
                  </span>
                  <span
                    className={`ap-souscheck-compteur${av.complete ? ' is-complet' : ''}`}
                  >
                    {av.faits}/{av.total}
                  </span>
                </button>

                <div className="ap-souscheck-bloc-meta">
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Échéance du bloc</span>
                    <input
                      type="date"
                      className="field-input"
                      value={groupe.echeance ?? ''}
                      onChange={(e) =>
                        majBloc(groupe.groupe, { echeance: e.target.value || null })
                      }
                    />
                  </label>
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Responsable du bloc</span>
                    <select
                      className="field-input"
                      disabled={equipeProjet.length === 0}
                      title={
                        equipeProjet.length === 0
                          ? 'Assigne d’abord une cellule à ce projet'
                          : undefined
                      }
                      value={groupe.responsable?.id ?? ''}
                      onChange={(e) =>
                        majBloc(groupe.groupe, { responsableId: e.target.value || null })
                      }
                    >
                      <option value="">— Non désigné —</option>
                      {equipeProjet.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.prenom} {c.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                  {groupe.prolongationDemandeeLe && (
                    <span className="ap-souscheck-prolongation">
                      <span className="pill pill--attention">
                        Prolongation demandée
                        {groupe.responsable ? ` par ${groupe.responsable.nom}` : ''} · proposée
                        au {formatDateCourte(groupe.prolongationEcheance!)}
                        {groupe.prolongationMotif ? ` — « ${groupe.prolongationMotif} »` : ''}
                      </span>
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => deciderProlongation(groupe.groupe, true)}
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => deciderProlongation(groupe.groupe, false)}
                      >
                        Refuser
                      </button>
                    </span>
                  )}
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
                </div>

                {!fermee && (
                <ul>
                  {groupe.items.map((it) => (
                    <li
                      key={it.id}
                      className={`ap-souscheck-item ap-souscheck-item--permis${
                        it.nonRequise ? ' ap-souscheck-item--non-requise' : ''
                      }`}
                    >
                      <label className="ap-souscheck-fait">
                        <input
                          type="checkbox"
                          checked={it.fait}
                          disabled={it.nonRequise}
                          onChange={(e) =>
                            majItemChecklist(it.id, { fait: e.target.checked })
                          }
                        />
                        <span>{it.libelle}</span>
                      </label>
                      <span className="ap-souscheck-actions">
                        <button
                          type="button"
                          className={`ap-souscheck-non-requise${
                            it.nonRequise ? ' est-actif' : ''
                          }`}
                          onClick={() => toggleNonRequis(it)}
                        >
                          Non nécessaire
                        </button>
                        <BoutonDetail
                          actif={!!it.note || it.fichiers.length > 0}
                          onClick={() => setDetailItem(it)}
                        />
                        <button
                          type="button"
                          className="ap-souscheck-suppr"
                          title="Retirer cet item"
                          onClick={() => supprimerItemChecklist(it.id)}
                        >
                          <Trash2 size={14} strokeWidth={2} aria-hidden />
                        </button>
                      </span>
                      {it.fait && it.faitPar && (
                        <span className="ap-souscheck-faitpar">Coché par {it.faitPar.nom}</span>
                      )}
                    </li>
                  ))}
                </ul>
                )}
                {!fermee && (
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm ap-souscheck-ajout-bouton"
                  onClick={() => setGroupeAjout(groupe.groupe)}
                >
                  <Plus size={14} strokeWidth={2} aria-hidden />
                  <span>Ajouter un item</span>
                </button>
                )}
              </section>
            );
          })}

          {groupeAjout && (
            <ChampModal
              titre="Ajouter un item de checklist"
              label="Libellé"
              placeholder="ex : Étanchéité terrasse"
              confirmer="Ajouter"
              onSubmit={async (valeur) => {
                await ajouterItemChecklist(groupeAjout, valeur);
                setGroupeAjout(null);
              }}
              onClose={() => setGroupeAjout(null)}
            />
          )}

          {detailItem && (
            <DetailItemModal
              libelle={detailItem.libelle}
              noteInitiale={detailItem.note}
              fichiers={detailItem.fichiers}
              onEnregistrerNote={(note) => majItemChecklist(detailItem.id, { note })}
              onClose={() => setDetailItem(null)}
            />
          )}

          {joindreGroupeOuvert && (
            <JoindreAvecItemModal
              items={
                exec.checklists
                  .find((g) => g.groupe === joindreGroupeOuvert)
                  ?.items.map((it) => ({ id: it.id, libelle: it.libelle })) ?? []
              }
              onJoindreImages={joindreImages}
              onJoindreFichiers={joindreFichiers}
              onClose={() => setJoindreGroupeOuvert(null)}
            />
          )}

          {erreur && <p className="field-erreur">{erreur}</p>}
        </>
      )}
    </>
  );
}
