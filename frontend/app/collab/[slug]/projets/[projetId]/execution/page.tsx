'use client';

import { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import {
  demanderProlongationBlocExecution,
  joindreFichiersLigneChecklistExecution,
  joindreImagesLigneChecklistExecution,
  majLigneChecklistExecution,
  patchBlocExecution,
  getExecution,
} from '@/lib/execution';
import { getMonProfil } from '@/lib/collab';
import {
  avancementChecklistAvp,
  type ChecklistExecutionGroupe,
  type Execution,
  type GroupeChecklistExecution,
  type ItemChecklistExecution,
  type MonProfil,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture, Coche, ListeCoches } from '@/components/collab/lecture';
import { ProlongationModal } from '@/components/collab/prolongation-modal';
import { BoutonDetail, JoindreAvecItemModal } from '@/components/permis-piece-jointe';
import { DetailItemModal } from '@/components/permis-detail-item-modal';

type Props = { params: { slug: string; projetId: string } };

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell slug={params.slug} projetId={params.projetId} section="execution">
      {() => <Vue slug={params.slug} projetId={params.projetId} />}
    </SectionCollabShell>
  );
}

function Vue({ slug, projetId }: { slug: string; projetId: string }) {
  const [exec, setExec] = useState<Execution | null>(null);
  // Profil complet : id (pour savoir de quels blocs ce collaborateur est
  // responsable — un par bloc, pas un seul pour tout le module ni un par
  // item, décision boss, sept. 2026) + estDispatcher/equipeAssignable (point
  // 1, sept. 2026 — réassigner le responsable d'un bloc depuis le collab).
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const monId = profil?.id ?? null;
  const [prolongerGroupe, setProlongerGroupe] = useState<ChecklistExecutionGroupe | null>(null);
  // Item dont la popup « Détail » (note + fichiers joints) est ouverte.
  const [detailItem, setDetailItem] = useState<ItemChecklistExecution | null>(null);
  // Groupe dont la popup « Joindre » (item-picker) est ouverte — un seul
  // point d'upload par bloc, même motif que Constitution sur Permis.
  const [joindreGroupeOuvert, setJoindreGroupeOuvert] = useState<GroupeChecklistExecution | null>(
    null,
  );

  useEffect(() => {
    getExecution(slug, projetId).then(setExec).catch(() => setExec(null));
    getMonProfil(slug).then(setProfil).catch(() => setProfil(null));
  }, [slug, projetId]);

  // Sondage — la checklist peut changer côté admin pendant que cette page
  // reste ouverte (même motif que la page Permis).
  useEffect(() => {
    const id = setInterval(() => {
      getExecution(slug, projetId).then(setExec).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [slug, projetId]);

  async function majItemChecklist(
    ligneId: string,
    patch: { fait?: boolean; note?: string; nonRequise?: boolean },
  ) {
    try {
      setExec(await majLigneChecklistExecution(slug, projetId, ligneId, patch));
    } catch {
      /* échec silencieux — l'état reste celui affiché */
    }
  }

  // Bascule « non nécessaire » — mutuellement exclusif avec fait (le serveur
  // force aussi fait à false).
  function toggleNonRequis(it: ItemChecklistExecution) {
    majItemChecklist(it.id, it.nonRequise ? { nonRequise: false } : { nonRequise: true, fait: false });
  }

  async function majResponsableBloc(
    groupe: ChecklistExecutionGroupe['groupe'],
    patch: { debut?: string | null; responsableId?: string | null; echeance?: string | null },
  ) {
    try {
      setExec(await patchBlocExecution(slug, projetId, groupe, patch));
    } catch {
      /* 403 si la cible sort du périmètre du dispatcher — état inchangé */
    }
  }

  async function envoyerProlongation(payload: { echeance: string; motif?: string }) {
    if (!prolongerGroupe) return;
    setExec(
      await demanderProlongationBlocExecution(slug, projetId, prolongerGroupe.groupe, payload),
    );
    setProlongerGroupe(null);
  }

  async function joindreImages(ligneId: string, fichiers: { nom: string; url: string }[]) {
    setExec(await joindreImagesLigneChecklistExecution(slug, projetId, ligneId, fichiers));
  }

  async function joindreFichiers(
    ligneId: string,
    fichiers: { nom: string; url: string; taille?: number }[],
  ) {
    setExec(await joindreFichiersLigneChecklistExecution(slug, projetId, ligneId, fichiers));
  }

  if (!exec) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  return (
    <>
      {exec.checklists.map((g) => {
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
              {jeSuisResponsable && (
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
            {!jeSuisResponsable ? (
              g.items.length === 0 ? (
                <p className="empty-state">Aucun item pour l’instant.</p>
              ) : (
                <ListeCoches>
                  {g.items.map((it) => (
                    <Coche key={it.id} ok={it.fait}>
                      {it.libelle}
                      {it.note ? ` — ${it.note}` : ''}
                    </Coche>
                  ))}
                </ListeCoches>
              )
            ) : g.items.length === 0 ? (
              <p className="empty-state">Aucun item pour l’instant.</p>
            ) : (
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
            )}
          </BlocLecture>
        );
      })}

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
    </>
  );
}
