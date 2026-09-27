'use client';

import { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import {
  annulerDce,
  constituerDce,
  getEtudes,
  joindreFichiersItemEtude,
  joindreImagesItemEtude,
  patchBlocEtude,
  patchItemEtude,
  type PatchBlocEtude,
} from '@/lib/etudes';
import {
  avancementChecklistFichiers,
  STATUTS_ETUDE,
  type Etudes,
  type ItemEtude,
  type StatutEtude,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture } from '@/components/collab/lecture';
import { BoutonDetail, JoindreAvecItemModal } from '@/components/permis-piece-jointe';
import { FoncierDetailModal } from '@/components/foncier-detail-modal';

type Props = { params: { slug: string; projetId: string } };

function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell slug={params.slug} projetId={params.projetId} section="etude">
      {() => <Vue slug={params.slug} projetId={params.projetId} />}
    </SectionCollabShell>
  );
}

function Vue({ slug, projetId }: { slug: string; projetId: string }) {
  const [etudes, setEtudes] = useState<Etudes | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<ItemEtude | null>(null);
  const [joindreBlocOuvert, setJoindreBlocOuvert] = useState<string | null>(null);

  useEffect(() => {
    getEtudes(slug, projetId).then(setEtudes).catch(() => setEtudes(null));
  }, [slug, projetId]);

  async function patchBloc(blocId: string, patch: PatchBlocEtude) {
    setErreur(null);
    try {
      setEtudes(await patchBlocEtude(slug, projetId, blocId, patch));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  async function basculerNonNecessaire(item: ItemEtude) {
    setErreur(null);
    try {
      setEtudes(
        await patchItemEtude(slug, projetId, item.id, {
          nonRequise: item.statut !== 'non_necessaire',
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.');
    }
  }

  async function basculerFait(item: ItemEtude) {
    setErreur(null);
    try {
      setEtudes(await patchItemEtude(slug, projetId, item.id, { fait: item.statut !== 'fait' }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.');
    }
  }

  async function joindreImages(itemId: string, fichiers: { nom: string; url: string }[]) {
    setErreur(null);
    try {
      setEtudes(await joindreImagesItemEtude(slug, projetId, itemId, fichiers));
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
      setEtudes(await joindreFichiersItemEtude(slug, projetId, itemId, fichiers));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    }
  }

  async function basculerDce() {
    if (!etudes) return;
    setEtudes(etudes.dceConstitue ? await annulerDce(slug, projetId) : await constituerDce(slug, projetId));
  }

  if (!etudes) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  const complet = etudes.blocs.every((b) => b.statut === 'validee' || b.statut === 'non_requise');

  return (
    <>
      {erreur && <p className="field-erreur">{erreur}</p>}
      {etudes.blocs.map((bloc) => {
        const av = avancementChecklistFichiers(bloc.items);
        return (
          <BlocLecture key={bloc.id} titre={`${bloc.libelle} · ${av.faits}/${av.total}`}>
            <div className="ap-souscheck-bloc-meta">
              <label className="field ap-souscheck-bloc-champ">
                <span className="field-label">Interlocuteur</span>
                <input
                  className="field-input"
                  defaultValue={bloc.interlocuteur}
                  placeholder="Nom du bureau d’études"
                  onBlur={(e) => {
                    if (e.target.value !== bloc.interlocuteur) {
                      patchBloc(bloc.id, { interlocuteur: e.target.value });
                    }
                  }}
                />
              </label>
              <label className="field ap-souscheck-bloc-champ">
                <span className="field-label">Contact</span>
                <input
                  className="field-input"
                  defaultValue={bloc.contactInterlocuteur}
                  placeholder="Téléphone, e-mail…"
                  onBlur={(e) => {
                    if (e.target.value !== bloc.contactInterlocuteur) {
                      patchBloc(bloc.id, { contactInterlocuteur: e.target.value });
                    }
                  }}
                />
              </label>
              <label className="field ap-souscheck-bloc-champ">
                <span className="field-label">Statut</span>
                <select
                  className={`field-input etude-statut etude-statut--${bloc.statut}`}
                  value={bloc.statut}
                  onChange={(e) => patchBloc(bloc.id, { statut: e.target.value as StatutEtude })}
                >
                  {(Object.keys(STATUTS_ETUDE) as StatutEtude[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUTS_ETUDE[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field ap-souscheck-bloc-champ">
                <span className="field-label">Remise prévue</span>
                <input
                  type="date"
                  className="field-input"
                  value={dateInput(bloc.dateRemisePrevue)}
                  onChange={(e) => patchBloc(bloc.id, { dateRemisePrevue: e.target.value || null })}
                />
              </label>
              <label className="field ap-souscheck-bloc-champ">
                <span className="field-label">Remise réelle</span>
                <input
                  type="date"
                  className="field-input"
                  value={dateInput(bloc.dateRemiseReelle)}
                  onChange={(e) => patchBloc(bloc.id, { dateRemiseReelle: e.target.value || null })}
                />
              </label>
              <label className="field ap-souscheck-bloc-champ">
                <span className="field-label">Note</span>
                <input
                  className="field-input"
                  defaultValue={bloc.note}
                  placeholder="—"
                  onBlur={(e) => {
                    if (e.target.value !== bloc.note) patchBloc(bloc.id, { note: e.target.value });
                  }}
                />
              </label>
              <div className="field ap-souscheck-bloc-champ ap-souscheck-bloc-champ--joindre">
                <span className="field-label">Ajouter une pièce</span>
                <button
                  type="button"
                  className="field-input ap-souscheck-joindre-champ"
                  onClick={() => setJoindreBlocOuvert(bloc.id)}
                >
                  <Paperclip size={14} strokeWidth={2} aria-hidden />
                  Joindre
                </button>
              </div>
            </div>

            <ul>
              {bloc.items.map((item) => (
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
                      disabled={item.statut === 'non_necessaire'}
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
              {bloc.items.length === 0 && (
                <p className="empty-state">Aucun livrable configuré pour ce bloc.</p>
              )}
            </ul>
          </BlocLecture>
        );
      })}

      <BlocLecture
        titre="Dossier de consultation des entreprises (DCE)"
        aside={
          <button
            type="button"
            className={etudes.dceConstitue ? 'btn-ghost btn-ghost--sm' : 'btn-primary btn-ghost--sm'}
            onClick={basculerDce}
            disabled={!etudes.dceConstitue && !complet}
            title={
              !etudes.dceConstitue && !complet
                ? 'Chaque étude doit être validée ou non requise'
                : undefined
            }
          >
            {etudes.dceConstitue
              ? `DCE constitué${etudes.dceLe ? ` le ${formatDateCourte(etudes.dceLe)}` : ''} — annuler`
              : 'Constituer le DCE'}
          </button>
        }
      >
        <p className="ap-a-venir" style={{ marginTop: 0 }}>
          Mobilisable quand chaque étude est validée ou non requise.
        </p>
      </BlocLecture>

      {detailItem && (
        <FoncierDetailModal
          libelle={detailItem.libelle}
          fichiers={detailItem.fichiers}
          onTelecharger={(f) => {
            const a = document.createElement('a');
            a.href = f.url;
            a.download = f.nom;
            document.body.appendChild(a);
            a.click();
            a.remove();
          }}
          onClose={() => setDetailItem(null)}
        />
      )}

      {joindreBlocOuvert && (
        <JoindreAvecItemModal
          items={
            etudes.blocs
              .find((b) => b.id === joindreBlocOuvert)
              ?.items.map((it) => ({ id: it.id, libelle: it.libelle })) ?? []
          }
          onJoindreImages={joindreImages}
          onJoindreFichiers={joindreFichiers}
          onClose={() => setJoindreBlocOuvert(null)}
        />
      )}
    </>
  );
}
