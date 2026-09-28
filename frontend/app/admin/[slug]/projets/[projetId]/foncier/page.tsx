'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Paperclip } from 'lucide-react';
import { getProjetExecution } from '@/lib/projets';
import {
  getFoncier,
  joindreFichiersFoncier,
  joindreImagesFoncier,
  patchBlocFoncier,
  patchItemFoncier,
} from '@/lib/foncier';
import { getCollaborateurs } from '@/lib/equipe';
import { useDroitsProjet, useTitrePage } from '@/lib/layout-contexte';
import {
  avancementChecklistFichiers,
  COULEUR_SECTION,
  type Collaborateur,
  type Foncier,
  type FichierItemFoncier,
  type GroupeFoncierCle,
  type ItemFoncier,
  type ProjetExecution,
} from '@/lib/types';
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

export default function FoncierPage({ params }: Props) {
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [foncier, setFoncier] = useState<Foncier | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Item dont la popup « Détails » (historique des fichiers) est ouverte.
  const [detailItem, setDetailItem] = useState<ItemFoncier | null>(null);
  // Équipe DU PROJET (cellules assignées) pour le sélecteur de responsable de
  // chaque bloc — même source que Permis/Avant-projet.
  const [equipeProjet, setEquipeProjet] = useState<Collaborateur[]>([]);
  // Blocs repliés — ouverts par défaut, état non persisté (juste l'affichage).
  const [groupesFermes, setGroupesFermes] = useState<Set<GroupeFoncierCle>>(new Set());
  // Groupe dont la popup « Joindre » (item-picker, même style qu'Autorisation,
  // sept. 2026) est ouverte — un seul point d'upload par bloc au lieu d'un
  // bouton Ajouter par item.
  const [joindreGroupeOuvert, setJoindreGroupeOuvert] = useState<GroupeFoncierCle | null>(null);

  useTitrePage('Foncier');
  const { ecriture } = useDroitsProjet();

  function toggleGroupe(groupe: GroupeFoncierCle) {
    setGroupesFermes((s) => {
      const suivant = new Set(s);
      if (suivant.has(groupe)) suivant.delete(groupe);
      else suivant.add(groupe);
      return suivant;
    });
  }

  useEffect(() => {
    getProjetExecution(params.slug, params.projetId).then((p) => {
      setProjet(p);
      if (p) {
        getFoncier(params.slug, params.projetId)
          .then(setFoncier)
          .catch((e) => setErreur(e instanceof Error ? e.message : 'Chargement impossible.'));
      }
    });
  }, [params.slug, params.projetId]);

  useEffect(() => {
    if (!projet?.cellules.length) {
      setEquipeProjet([]);
      return;
    }
    getCollaborateurs(params.slug, { cellule: projet.cellules })
      .then(setEquipeProjet)
      .catch(() => setEquipeProjet([]));
  }, [params.slug, projet?.cellules]);

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;

  // Pièces jointes par item — un seul point d'upload par bloc désormais (cf.
  // JoindreAvecItemModal), qui choisit d'abord l'item puis route vers la
  // bonne table (images/documents), même mécanisme que Permis/Exécution.
  async function joindreImages(itemId: string, fichiers: { nom: string; url: string }[]) {
    setErreur(null);
    try {
      setFoncier(await joindreImagesFoncier(params.slug, params.projetId, itemId, fichiers));
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
      setFoncier(await joindreFichiersFoncier(params.slug, params.projetId, itemId, fichiers));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    }
  }

  async function basculerNonNecessaire(item: ItemFoncier) {
    setErreur(null);
    try {
      setFoncier(
        await patchItemFoncier(params.slug, params.projetId, item.id, {
          nonRequise: item.statut !== 'non_necessaire',
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.');
    }
  }

  // Case à cocher manuelle (sept. 2026, en plus du statut dérivé des
  // fichiers) — librement décochable même si des fichiers restent attachés,
  // même contrat que Permis.
  async function basculerFait(item: ItemFoncier) {
    setErreur(null);
    try {
      setFoncier(
        await patchItemFoncier(params.slug, params.projetId, item.id, {
          fait: item.statut !== 'fait',
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.');
    }
  }

  // Responsable d'un bloc — admin, sélecteur toujours actif (vérifié côté
  // serveur de toute façon). Bloc laissé à « — Non désigné — » : toute
  // l'équipe du projet peut agir dessus (règle de septembre, en repli).
  async function majResponsableBloc(groupe: GroupeFoncierCle, responsableId: string | null) {
    setErreur(null);
    try {
      setFoncier(await patchBlocFoncier(params.slug, params.projetId, groupe, responsableId));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  return (
    <>
      <Link href={retour} className={`lien-retour lien-retour--${COULEUR_SECTION.foncier}`}>
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {projet === null ? (
        <p className="empty-state empty-state--bloc">Projet introuvable.</p>
      ) : projet === undefined || foncier === null ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : (
        <>
          {erreur && <p className="field-erreur">{erreur}</p>}
          {foncier.groupes.map((groupe) => {
            const av = avancementChecklistFichiers(groupe.items);
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
                  <span className={`ap-souscheck-compteur${av.complete ? ' is-complet' : ''}`}>
                    {av.faits}/{av.total}
                  </span>
                </button>

                <div className="ap-souscheck-bloc-meta">
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Responsable du bloc</span>
                    <select
                      className="field-input"
                      disabled={!ecriture || equipeProjet.length === 0}
                      title={
                        equipeProjet.length === 0
                          ? 'Assigne d’abord une cellule à ce projet'
                          : undefined
                      }
                      value={groupe.responsable?.id ?? ''}
                      onChange={(e) => majResponsableBloc(groupe.groupe, e.target.value || null)}
                    >
                      <option value="">— Non désigné —</option>
                      {equipeProjet.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.prenom} {c.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="field ap-souscheck-bloc-champ ap-souscheck-bloc-champ--joindre">
                    <span className="field-label">Ajouter une pièce</span>
                    {ecriture && (
<button
                      type="button"
                      className="field-input ap-souscheck-joindre-champ"
                      onClick={() => setJoindreGroupeOuvert(groupe.groupe)}
                    >
                      <Paperclip size={14} strokeWidth={2} aria-hidden />
                      Joindre
                    </button>
)}
                  </div>
                </div>

                {!fermee && (
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
                            disabled={!ecriture || item.statut === 'non_necessaire'}
                            onChange={() => basculerFait(item)}
                          />
                          <span>{item.libelle}</span>
                        </label>
                        <span className="ap-souscheck-actions">
                          <button
                            type="button"
                            className={`ap-souscheck-non-requise${
                              item.statut === 'non_necessaire' ? ' est-actif' : ''
                            }`}
                            onClick={() => basculerNonNecessaire(item)}
 disabled={!ecriture}
                          >
                            Non nécessaire
                          </button>
                          <BoutonDetail
                            actif={item.fichiers.length > 0}
                            onClick={() => setDetailItem(item)}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
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
            foncier?.groupes
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
