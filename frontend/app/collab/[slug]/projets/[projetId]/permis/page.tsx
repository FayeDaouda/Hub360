'use client';

import { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import {
  demanderProlongationBlocPermis,
  enregistrerPermis,
  getPermis,
  joindreFichiersBlocPermis,
  joindreFichiersLigneChecklistPermis,
  joindreImagesBlocPermis,
  joindreImagesLigneChecklistPermis,
  majLigneChecklistPermis,
  patchBlocPermis,
} from '@/lib/permis';
import { getMonProfil } from '@/lib/collab';
import {
  avancementChecklistAvp,
  STATUTS_PERMIS,
  STATUTS_PERMIS_CHOIX,
  type ChecklistPermisGroupe,
  type ItemChecklistPermis,
  type MonProfil,
  type Permis,
  type StatutPermis,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture, Champ, Champs, Coche, ListeCoches } from '@/components/collab/lecture';
import { ProlongationModal } from '@/components/collab/prolongation-modal';
import { BoutonDetail, BoutonJoindre, JoindreAvecItemModal } from '@/components/permis-piece-jointe';
import { DetailItemModal } from '@/components/permis-detail-item-modal';

type Props = { params: { slug: string; projetId: string } };

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell slug={params.slug} projetId={params.projetId} section="permis">
      {() => <Vue slug={params.slug} projetId={params.projetId} />}
    </SectionCollabShell>
  );
}

function Vue({ slug, projetId }: { slug: string; projetId: string }) {
  const [permis, setPermis] = useState<Permis | null>(null);
  // Profil complet : id (pour savoir de quels blocs ce collaborateur est
  // responsable — un par bloc, pas un seul pour tout le module ni un par
  // item, décision boss, sept. 2026) + estDispatcher/equipeAssignable (point
  // 1, sept. 2026 — réassigner le responsable d'un bloc depuis le collab).
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const monId = profil?.id ?? null;
  const [prolongerGroupe, setProlongerGroupe] = useState<ChecklistPermisGroupe | null>(null);
  // Item dont la popup « Détail » (note + fichiers joints) est ouverte.
  const [detailItem, setDetailItem] = useState<ItemChecklistPermis | null>(null);
  // Constitution : un seul point d'upload pour les 12 items — la popup
  // demande l'item concerné avant de choisir les fichiers.
  const [joindreConstitutionOuvert, setJoindreConstitutionOuvert] = useState(false);

  useEffect(() => {
    getPermis(slug, projetId).then(setPermis).catch(() => setPermis(null));
    getMonProfil(slug).then(setProfil).catch(() => setProfil(null));
  }, [slug, projetId]);

  // Sondage — le dossier peut changer côté admin pendant que cette page
  // reste ouverte (même motif que la page Avant-projet).
  useEffect(() => {
    const id = setInterval(() => {
      getPermis(slug, projetId).then(setPermis).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [slug, projetId]);

  async function maj(
    patch: Partial<Omit<Permis, 'projetId' | 'celluleIds' | 'checklists'>>,
  ) {
    setPermis(await enregistrerPermis(slug, projetId, patch));
  }

  async function majItemChecklist(
    ligneId: string,
    patch: { fait?: boolean; note?: string; nonRequise?: boolean },
  ) {
    try {
      setPermis(await majLigneChecklistPermis(slug, projetId, ligneId, patch));
    } catch {
      /* échec silencieux — l'état reste celui affiché */
    }
  }

  // Bascule « non nécessaire » — mutuellement exclusif avec fait (le serveur
  // force aussi fait à false, cf. PermisService.patchLigneChecklist).
  function toggleNonRequis(it: ItemChecklistPermis) {
    majItemChecklist(it.id, it.nonRequise ? { nonRequise: false } : { nonRequise: true, fait: false });
  }

  async function majResponsableBloc(
    groupe: ChecklistPermisGroupe['groupe'],
    patch: { debut?: string | null; responsableId?: string | null; echeance?: string | null },
  ) {
    try {
      setPermis(await patchBlocPermis(slug, projetId, groupe, patch));
    } catch {
      /* 403 si la cible sort du périmètre du dispatcher — état inchangé */
    }
  }

  async function envoyerProlongation(payload: { echeance: string; motif?: string }) {
    if (!prolongerGroupe) return;
    setPermis(
      await demanderProlongationBlocPermis(slug, projetId, prolongerGroupe.groupe, payload),
    );
    setProlongerGroupe(null);
  }

  async function joindreImages(ligneId: string, fichiers: { nom: string; url: string }[]) {
    setPermis(await joindreImagesLigneChecklistPermis(slug, projetId, ligneId, fichiers));
  }

  async function joindreFichiers(
    ligneId: string,
    fichiers: { nom: string; url: string; taille?: number }[],
  ) {
    setPermis(await joindreFichiersLigneChecklistPermis(slug, projetId, ligneId, fichiers));
  }

  // Pièces jointes au niveau du BLOC (Dépôt urbanisme / Procédure) — pas
  // liées à un item précis, réservé au responsable du bloc (vérifié côté
  // serveur, cf. lib/permis.ts).
  async function joindreImagesBloc(groupe: ChecklistPermisGroupe['groupe'], fichiers: { nom: string; url: string }[]) {
    setPermis(await joindreImagesBlocPermis(slug, projetId, groupe, fichiers));
  }

  async function joindreFichiersBloc(
    groupe: ChecklistPermisGroupe['groupe'],
    fichiers: { nom: string; url: string; taille?: number }[],
  ) {
    setPermis(await joindreFichiersBlocPermis(slug, projetId, groupe, fichiers));
  }

  if (!permis) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  // Dossier/statut recouvrent le même dossier administratif que le bloc
  // « Dossier de permis de construire » — même responsable + admin.
  const blocDossier = permis.checklists.find((g) => g.groupe === 'dossier_permis');
  const estResponsableDossier = !!monId && blocDossier?.responsable?.id === monId;

  return (
    <>
      {permis.checklists.map((g) => {
        const av = avancementChecklistAvp(g.items);
        const jeSuisResponsable = !!monId && g.responsable?.id === monId;
        return (
          <BlocLecture
            key={g.groupe}
            titre={`${g.libelle} · ${av.faits}/${av.total}`}
          >
            <p className="ap-souscheck-groupe-desc" style={{ marginTop: 0 }}>
              {g.description}
            </p>
            <div className="ap-souscheck-bloc-meta">
              {/* Éditable UNIQUEMENT si je suis dispatcher de ma cellule ET
                  que le responsable (actuel ou nul) en fait partie — même
                  périmètre que le guard estAutoriseAAssigner (point 1,
                  sept. 2026). Sinon, lecture seule comme avant. */}
              {profil?.estDispatcher &&
              (!g.responsable ||
                profil.equipeAssignable.some((m) => m.id === g.responsable!.id)) ? (
                <>
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Début</span>
                    <input
                      type="date"
                      className="field-input"
                      max={g.echeance ?? undefined}
                      value={g.debut ?? ''}
                      onChange={(e) =>
                        majResponsableBloc(g.groupe, { debut: e.target.value || null })
                      }
                    />
                  </label>
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Échéance du bloc</span>
                    <input
                      type="date"
                      className="field-input"
                      min={g.debut ?? undefined}
                      value={g.echeance ?? ''}
                      onChange={(e) =>
                        majResponsableBloc(g.groupe, { echeance: e.target.value || null })
                      }
                    />
                  </label>
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Responsable du bloc</span>
                    <select
                      className="field-input"
                      value={g.responsable?.id ?? ''}
                      onChange={(e) =>
                        majResponsableBloc(g.groupe, {
                          responsableId: e.target.value || null,
                        })
                      }
                    >
                      <option value="">— Non désigné —</option>
                      {profil.equipeAssignable.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.prenom} {m.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <span className="ap-souscheck-echeance-txt">
                    Début : {g.debut ? formatDateCourte(g.debut) : '—'}
                  </span>
                  <span className="ap-souscheck-echeance-txt">
                    Échéance : {g.echeance ? formatDateCourte(g.echeance) : '—'}
                  </span>
                  <span className="ap-souscheck-assigne-txt">
                    Responsable : {g.responsable ? g.responsable.nom : '—'}
                  </span>
                  {/* Auto-assignation sur un bloc encore libre — ouvert à
                      toute l'équipe du projet, pas seulement au dispatcher
                      (point « responsable du bloc », sept. 2026). Jamais
                      proposé si un responsable est déjà désigné : on ne
                      permet pas de « voler » un bloc à quelqu'un d'autre. */}
                  {!g.responsable && monId && (
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--sm"
                      onClick={() => majResponsableBloc(g.groupe, { responsableId: monId })}
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
                    onClick={() => setProlongerGroupe(g)}
                  >
                    Demander une prolongation
                  </button>
                ))}
              {jeSuisResponsable &&
                (g.groupe === 'dossier_permis' ? (
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
                      onJoindreImages={(f) => joindreImagesBloc(g.groupe, f)}
                      onJoindreFichiers={(f) => joindreFichiersBloc(g.groupe, f)}
                    />
                  </div>
                ))}
            </div>
            {!jeSuisResponsable ? (
              <ListeCoches>
                {g.items.map((it) => (
                  <Coche key={it.id} ok={it.fait}>
                    {it.libelle}
                    {it.note ? ` — ${it.note}` : ''}
                  </Coche>
                ))}
              </ListeCoches>
            ) : (
              <>
                <ul className="ap-souscheck-groupe-liste">
                  {g.items.map((it) => (
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
                      </span>
                      {it.fait && it.faitPar && (
                        <span className="ap-souscheck-faitpar">Coché par {it.faitPar.nom}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {g.groupe !== 'dossier_permis' && g.fichiersBloc.length > 0 && (
                  <div className="ap-souscheck-bloc-fichiers">
                    <span className="field-label">Pièces jointes du bloc</span>
                    <ul className="permis-detail-fichiers">
                      {g.fichiersBloc.map((f) => (
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
              </>
            )}
          </BlocLecture>
        );
      })}

      <BlocLecture titre="Statut du permis">
        {estResponsableDossier ? (
          <Champs>
            <Champ label="Statut">
              <select
                className="field-input"
                value={permis.statut}
                onChange={(e) => maj({ statut: e.target.value as StatutPermis })}
              >
                {STATUTS_PERMIS_CHOIX.map((s) => (
                  <option key={s} value={s}>
                    {STATUTS_PERMIS[s]}
                  </option>
                ))}
              </select>
            </Champ>
          </Champs>
        ) : (
          <Champs>
            <Champ label="Statut">{STATUTS_PERMIS[permis.statut]}</Champ>
          </Champs>
        )}
        {permis.statut === 'obtenu' && (
          <p className="permis-delai permis-delai--ok">
            Permis obtenu le {formatDateCourte(permis.dateObtention!)}
          </p>
        )}
        {permis.statut === 'refuse' && (
          <p className="permis-delai permis-delai--depasse">
            Permis refusé le {formatDateCourte(permis.dateRefus!)}
          </p>
        )}
      </BlocLecture>

      {prolongerGroupe && (
        <ProlongationModal
          libelle={prolongerGroupe.libelle}
          echeanceActuelle={prolongerGroupe.echeance}
          onSubmit={envoyerProlongation}
          onClose={() => setProlongerGroupe(null)}
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

      {joindreConstitutionOuvert && (
        <JoindreAvecItemModal
          items={blocDossier?.items.map((it) => ({ id: it.id, libelle: it.libelle })) ?? []}
          onJoindreImages={joindreImages}
          onJoindreFichiers={joindreFichiers}
          onClose={() => setJoindreConstitutionOuvert(false)}
        />
      )}
    </>
  );
}
