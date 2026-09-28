'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Paperclip, Plus, Stamp, Trash2 } from 'lucide-react';
import { getProjetExecution } from '@/lib/projets';
import {
  ajouterLigneChecklistPermis,
  deciderProlongationBlocPermis,
  enregistrerPermis,
  getPermis,
  joindreFichiersBlocPermis,
  joindreFichiersLigneChecklistPermis,
  joindreImagesBlocPermis,
  joindreImagesLigneChecklistPermis,
  majLigneChecklistPermis,
  patchBlocPermis,
  supprimerLigneChecklistPermis,
} from '@/lib/permis';
import { getCollaborateurs } from '@/lib/equipe';
import { useDroitsProjet, useTitrePage } from '@/lib/layout-contexte';
import {
  avancementChecklistAvp,
  CATEGORIES,
  NATURES_DOSSIER,
  STATUTS_PERMIS,
  STATUTS_PERMIS_CHOIX,
  type Collaborateur,
  type GroupeChecklistPermis,
  type ItemChecklistPermis,
  type Permis,
  type ProjetExecution,
  type StatutPermis,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { ChampModal } from '@/components/admin/champ-modal';
import { BoutonDetail, BoutonJoindre, JoindreAvecItemModal } from '@/components/permis-piece-jointe';
import { DetailItemModal } from '@/components/permis-detail-item-modal';

type Props = { params: { slug: string; projetId: string } };

export default function PermisPage({ params }: Props) {
  useTitrePage('Autorisation');
  const { ecriture } = useDroitsProjet();
  const router = useRouter();
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [permis, setPermis] = useState<Permis | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Équipe DU PROJET (cellule assignée) pour le sélecteur de responsable de
  // chaque bloc — même source que la page Avant-projet.
  const [equipeProjet, setEquipeProjet] = useState<Collaborateur[]>([]);
  const [groupeAjout, setGroupeAjout] = useState<GroupeChecklistPermis | null>(null);
  const [groupesFermes, setGroupesFermes] = useState<Set<GroupeChecklistPermis>>(new Set());
  // Item dont la popup « Détail » (note + fichiers joints) est ouverte.
  const [detailItem, setDetailItem] = useState<ItemChecklistPermis | null>(null);
  // Constitution : un seul point d'upload pour les 12 items — la popup
  // demande l'item concerné avant de choisir les fichiers.
  const [joindreConstitutionOuvert, setJoindreConstitutionOuvert] = useState(false);

  function toggleGroupe(groupe: GroupeChecklistPermis) {
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
      // Le permis n'existe que pour la conception.
      if (p && p.categorie !== 'conception') {
        router.replace(`/admin/${params.slug}/projets/${params.projetId}`);
      }
    });
    getPermis(params.slug, params.projetId).then(setPermis);
  }, [params.slug, params.projetId, router]);

  // Équipe(s) du projet — chargées dès que les cellules assignées sont
  // connues (arrivent avec `permis`, après `projet`). Même motif que la page
  // Avant-projet.
  useEffect(() => {
    if (!permis?.celluleIds.length) {
      setEquipeProjet([]);
      return;
    }
    getCollaborateurs(params.slug, { cellule: permis.celluleIds })
      .then(setEquipeProjet)
      .catch(() => setEquipeProjet([]));
  }, [params.slug, permis?.celluleIds]);

  // Sondage — la checklist peut changer côté collaborateur (coché, demande de
  // prolongation) pendant que cette page reste ouverte.
  useEffect(() => {
    if (!projet) return;
    const id = setInterval(() => {
      getPermis(params.slug, params.projetId).then(setPermis).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [params.slug, params.projetId, projet]);

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;

  function maj<K extends keyof Permis>(cle: K, valeur: Permis[K]) {
    setPermis((p) => (p ? { ...p, [cle]: valeur } : p));
    setEnregistre(false);
  }

  async function enregistrer() {
    if (!permis) return;
    setEnCours(true);
    setErreur(null);
    try {
      const { projetId, celluleIds, checklists, ...patch } = permis;
      const maj = await enregistrerPermis(params.slug, params.projetId, patch);
      setPermis(maj);
      setEnregistre(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    }
    setEnCours(false);
  }

  // Coche / annote une ligne de sous-checklist — persiste tout de suite.
  async function majItemChecklist(
    ligneId: string,
    patch: { fait?: boolean; note?: string; nonRequise?: boolean },
  ) {
    setErreur(null);
    try {
      setPermis(await majLigneChecklistPermis(params.slug, params.projetId, ligneId, patch));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  // Bascule « non nécessaire » — mutuellement exclusif avec fait (cf.
  // PermisService.patchLigneChecklist, qui force fait à false côté serveur
  // aussi). On l'envoie explicitement ici pour que l'UI reflète l'état sans
  // attendre l'aller-retour.
  function toggleNonRequis(it: ItemChecklistPermis) {
    majItemChecklist(it.id, it.nonRequise ? { nonRequise: false } : { nonRequise: true, fait: false });
  }

  // Échéance + responsable d'un bloc — admin uniquement (vérifié côté
  // serveur). Seul le responsable désigné (+ l'admin) pourra ensuite
  // cocher/uploader/prolonger sur ce bloc précis.
  async function majBloc(
    groupe: GroupeChecklistPermis,
    patch: { echeance?: string | null; responsableId?: string | null },
  ) {
    setErreur(null);
    try {
      setPermis(await patchBlocPermis(params.slug, params.projetId, groupe, patch));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  async function joindreImages(ligneId: string, fichiers: { nom: string; url: string }[]) {
    setErreur(null);
    try {
      setPermis(
        await joindreImagesLigneChecklistPermis(params.slug, params.projetId, ligneId, fichiers),
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
      setPermis(
        await joindreFichiersLigneChecklistPermis(params.slug, params.projetId, ligneId, fichiers),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout du fichier a échoué.");
    }
  }

  // Pièces jointes au niveau du BLOC (Dépôt urbanisme / Procédure) — pas
  // liées à un item précis, cf. lib/permis.ts.
  async function joindreImagesBloc(groupe: GroupeChecklistPermis, fichiers: { nom: string; url: string }[]) {
    setErreur(null);
    try {
      setPermis(await joindreImagesBlocPermis(params.slug, params.projetId, groupe, fichiers));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout du fichier a échoué.");
    }
  }

  async function joindreFichiersBloc(
    groupe: GroupeChecklistPermis,
    fichiers: { nom: string; url: string; taille?: number }[],
  ) {
    setErreur(null);
    try {
      setPermis(await joindreFichiersBlocPermis(params.slug, params.projetId, groupe, fichiers));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout du fichier a échoué.");
    }
  }

  // Décision sur une demande de prolongation en attente (au niveau du bloc).
  async function deciderProlongation(groupe: GroupeChecklistPermis, accepter: boolean) {
    setErreur(null);
    try {
      setPermis(
        await deciderProlongationBlocPermis(params.slug, params.projetId, groupe, accepter),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  async function ajouterItemChecklist(groupe: GroupeChecklistPermis, libelle: string) {
    setPermis(await ajouterLigneChecklistPermis(params.slug, params.projetId, { groupe, libelle }));
  }

  async function supprimerItemChecklist(ligneId: string) {
    if (!window.confirm('Retirer cet item de la checklist ?')) return;
    setErreur(null);
    try {
      setPermis(await supprimerLigneChecklistPermis(params.slug, params.projetId, ligneId));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suppression impossible.');
    }
  }

  return (
    <>
      <Link href={retour} className="lien-retour lien-retour--permis">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {!permis || projet === undefined ? (
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
                <span className="module-icone module-icone--permis" aria-hidden>
                  <Stamp size={17} strokeWidth={1.75} />
                </span>
                Autorisation
              </h2>
              <p className="projet-entete-meta">
                {projet.programme} · {projet.client.nom} · {projet.localisation}
              </p>
            </div>
            <span
              className={`pill ${
                permis.statut === 'obtenu'
                  ? 'pill--succes'
                  : permis.statut === 'refuse'
                    ? 'pill--risque'
                    : 'pill--info'
              }`}
            >
              {STATUTS_PERMIS[permis.statut]}
            </span>
          </header>

          {(() => {
            if (permis.statut === 'obtenu') {
              return (
                <p className="permis-delai permis-delai--ok">
                  Permis obtenu le {formatDateCourte(permis.dateObtention!)}
                </p>
              );
            }
            if (permis.statut === 'refuse') {
              return (
                <p className="permis-delai permis-delai--depasse">
                  Permis refusé le {formatDateCourte(permis.dateRefus!)}
                </p>
              );
            }
            return null;
          })()}

          {permis.checklists.map((groupe) => {
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
                      disabled={!ecriture}
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
                        <>
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
                        </>
                      )}
                    </span>
                  )}
                  {!ecriture ? null : groupe.groupe === 'dossier_permis' ? (
                    <div className="field ap-souscheck-bloc-champ ap-souscheck-bloc-champ--joindre">
                      <span className="field-label">Ajouter une pièce</span>
                      <button
                        type="button"
                        className="field-input ap-souscheck-joindre-champ"
                        onClick={() => setJoindreConstitutionOuvert(true)}
                      >
                        <Paperclip size={14} strokeWidth={2} aria-hidden />
                        Joindre
                      </button>
                    </div>
                  ) : (
                    <div className="field ap-souscheck-bloc-champ ap-souscheck-bloc-champ--joindre">
                      <span className="field-label">Pièces jointes</span>
                      <BoutonJoindre
                        className="field-input ap-souscheck-joindre-champ"
                        iconSize={14}
                        onJoindreImages={(f) => joindreImagesBloc(groupe.groupe, f)}
                        onJoindreFichiers={(f) => joindreFichiersBloc(groupe.groupe, f)}
                      />
                    </div>
                  )}
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
                          disabled={!ecriture || it.nonRequise}
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
                          disabled={!ecriture}
                        >
                          Non nécessaire
                        </button>
                        <BoutonDetail
                          actif={!!it.note || it.fichiers.length > 0}
                          onClick={() => setDetailItem(it)}
                        />
                        {ecriture && (
                          <button
                            type="button"
                            className="ap-souscheck-suppr"
                            title="Retirer cet item"
                            onClick={() => supprimerItemChecklist(it.id)}
                          >
                            <Trash2 size={14} strokeWidth={2} aria-hidden />
                          </button>
                        )}
                      </span>
                      {it.fait && it.faitPar && (
                        <span className="ap-souscheck-faitpar">Coché par {it.faitPar.nom}</span>
                      )}
                    </li>
                  ))}
                </ul>
                )}
                {!fermee && groupe.groupe !== 'dossier_permis' && groupe.fichiersBloc.length > 0 && (
                  <div className="ap-souscheck-bloc-fichiers">
                    <span className="field-label">Pièces jointes du bloc</span>
                    <ul className="permis-detail-fichiers">
                      {groupe.fichiersBloc.map((f) => (
                        <li key={f.id}>
                          <a href={f.url} target="_blank" rel="noreferrer" title={f.nom}>
                            {f.estImage && <img src={f.url} alt="" />}
                            <span>{f.nom}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
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
            <DetailItemModal
              libelle={detailItem.libelle}
              noteInitiale={detailItem.note}
              fichiers={detailItem.fichiers}
              onEnregistrerNote={(note) => majItemChecklist(detailItem.id, { note })}
              onClose={() => setDetailItem(null)}
              lectureSeule={!ecriture}
            />
          )}

          {joindreConstitutionOuvert && (
            <JoindreAvecItemModal
              items={
                permis.checklists
                  .find((g) => g.groupe === 'dossier_permis')
                  ?.items.map((it) => ({ id: it.id, libelle: it.libelle })) ?? []
              }
              onJoindreImages={joindreImages}
              onJoindreFichiers={joindreFichiers}
              onClose={() => setJoindreConstitutionOuvert(false)}
            />
          )}

          {/* Statut */}
          <section className="panel">
            <h3 className="panel-title">Statut du permis</h3>
            <label className="field" style={{ maxWidth: 260 }}>
              <span className="field-label">Statut</span>
              <select
                className="field-input"
                disabled={!ecriture}
                value={permis.statut}
                onChange={(e) => maj('statut', e.target.value as StatutPermis)}
              >
                {STATUTS_PERMIS_CHOIX.map((s) => (
                  <option key={s} value={s}>
                    {STATUTS_PERMIS[s]}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {erreur && <p className="field-erreur">{erreur}</p>}
          {ecriture && (
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={enregistrer}
              disabled={enCours}
            >
              {enregistre ? 'Enregistré' : enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
          )}
        </>
      )}
    </>
  );
}
