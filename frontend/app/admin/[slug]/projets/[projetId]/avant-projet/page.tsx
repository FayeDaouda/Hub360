'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Lightbulb, Paperclip, Plus, Trash2 } from 'lucide-react';
import {
  ajouterLigneChecklistAvp,
  demanderProlongationBlocChecklistAvp,
  deciderProlongationBlocChecklistAvp,
  getAvantProjet,
  getProjetExecution,
  joindreFichiersLigneChecklistAvp,
  joindreImagesLigneChecklistAvp,
  majLigneChecklistAvp,
  patchBlocChecklistAvp,
  supprimerLigneChecklistAvp,
} from '@/lib/projets';
import { getCollaborateurs } from '@/lib/equipe';
import { useDroitsProjet, useTitrePage } from '@/lib/layout-contexte';
import {
  avancementChecklistFichiers,
  CATEGORIES,
  NATURES_DOSSIER,
  TYPES_BIEN,
  type AvantProjet,
  type Collaborateur,
  type FichierItemChecklistAvp,
  type GroupeChecklistAvp,
  type ItemChecklistAvp,
  type ProjetExecution,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { ChampModal } from '@/components/admin/champ-modal';
import { BoutonDetail, JoindreAvecItemModal } from '@/components/permis-piece-jointe';
import { FoncierDetailModal } from '@/components/foncier-detail-modal';

type Props = {
  params: { slug: string; projetId: string };
};

function telecharger(f: FichierItemChecklistAvp) {
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function AvantProjetPage({ params }: Props) {
  useTitrePage('Avant-projet');
  const { ecriture } = useDroitsProjet();
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [ap, setAp] = useState<AvantProjet | null>(null);
  // Équipe DU PROJET (cellules assignées) — pour le sélecteur de responsable
  // de chaque bloc.
  const [equipeProjet, setEquipeProjet] = useState<Collaborateur[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [groupeAjout, setGroupeAjout] = useState<GroupeChecklistAvp | null>(null);
  const [detailItem, setDetailItem] = useState<ItemChecklistAvp | null>(null);
  // Groupes du Suivi opérationnel repliés — ouverts par défaut.
  const [groupesFermes, setGroupesFermes] = useState<Set<GroupeChecklistAvp>>(new Set());
  // Groupe dont la popup « Joindre » (item-picker, même style qu'Autorisation,
  // sept. 2026) est ouverte — un seul point d'upload par bloc.
  const [joindreGroupeOuvert, setJoindreGroupeOuvert] = useState<GroupeChecklistAvp | null>(null);

  function toggleGroupe(groupe: GroupeChecklistAvp) {
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
      // Ne charge l'avant-projet que si le projet existe : sinon le GET
      // renvoie 404 « Projet introuvable » et l'erreur remonte non gérée.
      if (p) getAvantProjet(params.slug, params.projetId).then(setAp);
    });
  }, [params.slug, params.projetId]);

  // Équipe(s) du projet — chargée séparément dès que les cellules assignées
  // sont connues (arrivent avec `ap`, après `projet`). Vide si le projet n'a
  // encore aucune cellule assignée (statut « à assigner »).
  useEffect(() => {
    if (!ap?.celluleIds.length) {
      setEquipeProjet([]);
      return;
    }
    getCollaborateurs(params.slug, { cellule: ap.celluleIds })
      .then(setEquipeProjet)
      .catch(() => setEquipeProjet([]));
  }, [params.slug, ap?.celluleIds]);

  // Sondage — la checklist peut changer côté collaborateur (coché, demande de
  // prolongation) pendant que cette page reste ouverte.
  useEffect(() => {
    if (!projet) return;
    const id = setInterval(() => {
      getAvantProjet(params.slug, params.projetId).then(setAp).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [params.slug, params.projetId, projet]);

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;

  // Bascule « non nécessaire » sur un item — statut dérivé des fichiers joints.
  async function basculerNonNecessaire(item: ItemChecklistAvp) {
    setErreur(null);
    try {
      setAp(
        await majLigneChecklistAvp(params.slug, params.projetId, item.id, {
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
      setAp(
        await majLigneChecklistAvp(params.slug, params.projetId, item.id, {
          fait: item.statut !== 'fait',
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.');
    }
  }

  async function joindreImages(itemId: string, fichiers: { nom: string; url: string }[]) {
    setErreur(null);
    try {
      setAp(await joindreImagesLigneChecklistAvp(params.slug, params.projetId, itemId, fichiers));
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
      setAp(await joindreFichiersLigneChecklistAvp(params.slug, params.projetId, itemId, fichiers));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    }
  }

  // Responsable + échéance d'un bloc — sélecteur toujours actif côté admin
  // (vérifié côté serveur de toute façon). Bloc laissé à « — Non désigné — » :
  // toute l'équipe du projet peut agir dessus (règle de septembre, en repli).
  async function majBloc(
    groupe: GroupeChecklistAvp,
    patch: { debut?: string | null; echeance?: string | null; responsableId?: string | null },
  ) {
    setErreur(null);
    try {
      setAp(await patchBlocChecklistAvp(params.slug, params.projetId, groupe, patch));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  async function deciderProlongation(groupe: GroupeChecklistAvp, accepter: boolean) {
    setErreur(null);
    try {
      setAp(
        await deciderProlongationBlocChecklistAvp(params.slug, params.projetId, groupe, accepter),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  // Ajout/suppression d'un item — admin OU dispatcher d'une cellule du projet
  // (nouveauté sept. 2026). Erreur affichée dans la modale elle-même
  // (ChampModal) pour l'ajout.
  async function ajouterItemChecklist(groupe: GroupeChecklistAvp, libelle: string) {
    setAp(await ajouterLigneChecklistAvp(params.slug, params.projetId, { groupe, libelle }));
  }

  async function supprimerItemChecklist(ligneId: string) {
    if (!window.confirm('Retirer cet item de la checklist ?')) return;
    setErreur(null);
    try {
      setAp(await supprimerLigneChecklistAvp(params.slug, params.projetId, ligneId));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suppression impossible.');
    }
  }

  return (
    <>
      <Link href={retour} className="lien-retour lien-retour--avant-projet">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {projet === null ? (
        <p className="empty-state empty-state--bloc">Projet introuvable.</p>
      ) : projet === undefined || !ap ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
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
                <span className="module-icone module-icone--avant-projet" aria-hidden>
                  <Lightbulb size={17} strokeWidth={1.75} />
                </span>
                Avant-projet
              </h2>
              <p className="projet-entete-meta">
                {projet.programme} · {projet.client.nom} · {projet.localisation}
              </p>
            </div>
          </header>

          {/* Contexte repris du CRM — non ressaisi */}
          <div className="ap-contexte">
            <span>
              <strong>Type</strong> {TYPES_BIEN[projet.type]}
            </span>
            <span>
              <strong>Catégorie</strong> {CATEGORIES[projet.categorie]}
            </span>
          </div>

          {erreur && <p className="field-erreur">{erreur}</p>}

          <h3 className="panel-title">Suivi opérationnel</h3>
          <p className="ap-souscheck-intro">
            Les checklists de production de l’équipe. Indicatif — ne bloque pas
            le passage de phase.
          </p>

          {ap.checklists.map((groupe) => {
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
                        <span className="field-label">Début</span>
                        <input
                          type="date"
                          className="field-input"
                          disabled={!ecriture}
                          max={groupe.echeance ?? undefined}
                          value={groupe.debut ?? ''}
                          onChange={(e) => majBloc(groupe.groupe, { debut: e.target.value || null })}
                        />
                      </label>
                      <label className="field ap-souscheck-bloc-champ">
                        <span className="field-label">Échéance du bloc</span>
                        <input
                          type="date"
                          className="field-input"
                          disabled={!ecriture}
                          min={groupe.debut ?? undefined}
                          value={groupe.echeance ?? ''}
                          onChange={(e) => majBloc(groupe.groupe, { echeance: e.target.value || null })}
                        />
                      </label>
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
                          {ecriture && (
<button
                            type="button"
                            className="btn-ghost btn-ghost--sm"
                            onClick={() => deciderProlongation(groupe.groupe, true)}
                          >
                            Accepter
                          </button>
)}
                          {ecriture && (
<button
                            type="button"
                            className="btn-ghost btn-ghost--sm"
                            onClick={() => deciderProlongation(groupe.groupe, false)}
                          >
                            Refuser
                          </button>
)}
                        </span>
                      )}
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
                              {ecriture && (
<button
                                type="button"
                                className="ap-souscheck-suppr"
                                title="Retirer cet item"
                                onClick={() => supprimerItemChecklist(item.id)}
                              >
                                <Trash2 size={14} strokeWidth={2} aria-hidden />
                              </button>
)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!fermee && ecriture && (
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
              placeholder="ex : Étude de sol"
              confirmer="Ajouter"
              onSubmit={async (valeur) => {
                await ajouterItemChecklist(groupeAjout, valeur);
                setGroupeAjout(null);
              }}
              onClose={() => setGroupeAjout(null)}
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

          <p className="ap-a-venir">
            Prochainement dans cette section : Site &amp; réglementation · Esquisse &amp; APD.
          </p>
        </>
      )}
    </>
  );
}
